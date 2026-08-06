import {
  accountingFirm,
  allOrganisationNumbers,
  entity,
  roles,
} from "./brreg.js";
import { config } from "./config.js";
import { db } from "./db.js";
import {
  array,
  errorText,
  normalizeIndustryCode,
  numberValue,
  object,
  pathValue,
  sleep,
  text,
  type JsonObject,
} from "./util.js";

function mapped(raw: JsonObject, roleData: JsonObject) {
  const addressObject =
    object(raw.forretningsadresse) ??
    object(raw.postadresse) ??
    {};

  const address = array(addressObject.adresse)
    .map(text)
    .filter((item): item is string => Boolean(item))
    .join(", ");

  const firm = accountingFirm(roleData);

  return {
    organisationNumber: text(raw.organisasjonsnummer) ?? "",
    name: text(raw.navn) ?? "Ukjent",
    organisationForm:
      text(pathValue(raw, "organisasjonsform", "beskrivelse")) ??
      text(pathValue(raw, "organisasjonsform", "kode")),
    address: address || null,
    postalCode: text(addressObject.postnummer),
    postalPlace: text(addressObject.poststed),
    municipality:
      text(addressObject.kommune) ??
      text(pathValue(addressObject, "kommune", "navn")),
    industryCode: text(pathValue(raw, "naeringskode1", "kode")),
    industryDescription:
      text(pathValue(raw, "naeringskode1", "beskrivelse")),
    numberOfEmployees: numberValue(raw.antallAnsatte),
    accountingFirmName: firm?.name ?? null,
    accountingFirmOrganisationNumber:
      firm?.organisationNumber ?? null,
    fetchedAt: new Date().toISOString(),
    rawJson: JSON.stringify(raw),
    rolesJson: JSON.stringify(roleData),
  };
}

const upsertCompany = db.prepare(`
  INSERT INTO companies (
    organisation_number, name, organisation_form, address,
    postal_code, postal_place, municipality, industry_code,
    industry_description, number_of_employees,
    accounting_firm_name, accounting_firm_organisation_number,
    fetched_at, raw_json, roles_json
  ) VALUES (
    @organisationNumber, @name, @organisationForm, @address,
    @postalCode, @postalPlace, @municipality, @industryCode,
    @industryDescription, @numberOfEmployees,
    @accountingFirmName, @accountingFirmOrganisationNumber,
    @fetchedAt, @rawJson, @rolesJson
  )
  ON CONFLICT(organisation_number) DO UPDATE SET
    name = excluded.name,
    organisation_form = excluded.organisation_form,
    address = excluded.address,
    postal_code = excluded.postal_code,
    postal_place = excluded.postal_place,
    municipality = excluded.municipality,
    industry_code = excluded.industry_code,
    industry_description = excluded.industry_description,
    number_of_employees = excluded.number_of_employees,
    accounting_firm_name = excluded.accounting_firm_name,
    accounting_firm_organisation_number =
      excluded.accounting_firm_organisation_number,
    fetched_at = excluded.fetched_at,
    raw_json = excluded.raw_json,
    roles_json = excluded.roles_json
`);

function duration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((item) => String(item).padStart(2, "0"))
    .join(":");
}

export async function runExtraction(industryCodeInput: string): Promise<void> {
  const industryCode = normalizeIndustryCode(industryCodeInput);
  console.log(`Forbereder ${industryCode} …`);

  const result = await allOrganisationNumbers(industryCode);
  const now = new Date().toISOString();

  const targetUpsert = db.prepare(`
    INSERT INTO targets (
      industry_code, organisation_number, sequence_number, updated_at
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(industry_code, organisation_number) DO UPDATE SET
      sequence_number = excluded.sequence_number,
      updated_at = excluded.updated_at
  `);

  db.transaction(() => {
    result.organisationNumbers.forEach((orgnr, index) => {
      targetUpsert.run(industryCode, orgnr, index, now);
    });

    db.prepare(`
      INSERT INTO industries (
        code, description, company_count,
        imported_count, imported_at, updated_at
      ) VALUES (?, ?, ?, 0, NULL, ?)
      ON CONFLICT(code) DO UPDATE SET
        description = excluded.description,
        company_count = excluded.company_count,
        updated_at = excluded.updated_at
    `).run(
      industryCode,
      result.description,
      result.organisationNumbers.length,
      now,
    );
  })();

  const targets = db.prepare(`
    SELECT organisation_number AS organisationNumber
    FROM targets
    WHERE industry_code = ? AND imported = 0
    ORDER BY sequence_number
  `).all(industryCode) as Array<{ organisationNumber: string }>;

  const total = result.organisationNumbers.length;
  const initialCompleted = total - targets.length;
  const startedAt = Date.now();
  let completed = initialCompleted;
  let failed = 0;

  for (const target of targets) {
    try {
      const raw = await entity(target.organisationNumber);
      await sleep(config.delayMs);
      const roleData = await roles(target.organisationNumber);
      upsertCompany.run(mapped(raw, roleData));

      db.prepare(`
        UPDATE targets
        SET imported = 1, last_error = NULL, updated_at = ?
        WHERE industry_code = ? AND organisation_number = ?
      `).run(new Date().toISOString(), industryCode, target.organisationNumber);
    } catch (error) {
      failed += 1;
      db.prepare(`
        UPDATE targets
        SET last_error = ?, updated_at = ?
        WHERE industry_code = ? AND organisation_number = ?
      `).run(
        errorText(error).slice(0, 1000),
        new Date().toISOString(),
        industryCode,
        target.organisationNumber,
      );
    }

    completed += 1;

    if (completed % config.batchSize === 0 || completed === total) {
      const elapsed = Date.now() - startedAt;
      const processed = Math.max(1, completed - initialCompleted);
      const remaining = Math.max(0, total - completed);
      const eta = (elapsed / processed) * remaining;

      console.log("");
      console.log("========================================");
      console.log(`${completed.toLocaleString("nb-NO")} / ${total.toLocaleString("nb-NO")} selskaper`);
      console.log(`${((completed / total) * 100).toFixed(2)} %`);
      console.log(`Tid brukt: ${duration(elapsed)}`);
      console.log(`Estimert tid igjen: ${duration(eta)}`);
      console.log(`Feilet: ${failed}`);
      console.log("========================================");
    }

    await sleep(config.delayMs);
  }

  const finishedAt = new Date().toISOString();
  db.prepare(`
    UPDATE industries
    SET
      imported_count = (
        SELECT COUNT(*)
        FROM targets
        WHERE industry_code = ? AND imported = 1
      ),
      imported_at = ?,
      updated_at = ?
    WHERE code = ?
  `).run(industryCode, finishedAt, finishedAt, industryCode);
}
