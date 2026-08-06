import express from "express";
import path from "node:path";
import * as XLSX from "xlsx";
import { config } from "./config.js";
import { db } from "./db.js";
import { normalizeIndustryCode } from "./util.js";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.resolve("public")));

function value(input: unknown): string {
  return String(input ?? "").trim();
}

function integer(
  input: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(input);
  return Number.isFinite(parsed)
    ? Math.max(minimum, Math.min(maximum, Math.floor(parsed)))
    : fallback;
}

type Filter = {
  industry: string;
  q: string;
  firm: string;
  municipality: string;
  employees: string;
  organisationForm: string;
  prospectStatus: string;
  crmMode: string;
};

function industryValue(input: unknown): string {
  const raw = value(input || "47.710");
  return raw === "__ALL__" ? "__ALL__" : normalizeIndustryCode(raw);
}

function parseFilter(query: express.Request["query"]): Filter {
  return {
    industry: industryValue(query.industry),
    q: value(query.q),
    firm: value(query.firm),
    municipality: value(query.municipality),
    employees: value(query.employees),
    organisationForm: value(query.organisationForm),
    prospectStatus: value(query.prospectStatus),
    crmMode: value(query.crmMode),
  };
}

const segmentFrom = `
  FROM companies AS c
  LEFT JOIN prospect_notes AS p
    ON p.organisation_number = c.organisation_number
`;

function segmentClause(industry: string): {
  sql: string;
  parameters: unknown[];
} {
  if (industry === "__ALL__") {
    return {
      sql: `EXISTS (
        SELECT 1
        FROM targets AS t
        WHERE
          t.organisation_number = c.organisation_number
          AND t.imported = 1
      )`,
      parameters: [],
    };
  }

  return {
    sql: `EXISTS (
      SELECT 1
      FROM targets AS t
      WHERE
        t.organisation_number = c.organisation_number
        AND t.industry_code = ?
        AND t.imported = 1
    )`,
    parameters: [industry],
  };
}

function companyWhere(filter: Filter): {
  sql: string;
  parameters: unknown[];
} {
  const segment = segmentClause(filter.industry);
  const clauses = [segment.sql];
  const parameters: unknown[] = [...segment.parameters];

  if (filter.q) {
    const like = `%${filter.q}%`;
    clauses.push(`(
      c.name LIKE ?
      OR c.organisation_number LIKE ?
      OR c.accounting_firm_name LIKE ?
      OR c.postal_place LIKE ?
      OR c.municipality LIKE ?
    )`);
    parameters.push(like, like, like, like, like);
  }

  if (filter.firm === "__WITHOUT__") {
    clauses.push("c.accounting_firm_name IS NULL");
  } else if (filter.firm) {
    clauses.push("c.accounting_firm_name = ?");
    parameters.push(filter.firm);
  }

  if (filter.municipality) {
    clauses.push("c.municipality = ?");
    parameters.push(filter.municipality);
  }

  if (filter.organisationForm) {
    clauses.push("c.organisation_form = ?");
    parameters.push(filter.organisationForm);
  }

  if (filter.prospectStatus) {
    clauses.push("COALESCE(p.status, 'Ny') = ?");
    parameters.push(filter.prospectStatus);
  }

  const employeeSql: Record<string, string> = {
    "0": "COALESCE(c.number_of_employees, 0) = 0",
    "1-4": "c.number_of_employees BETWEEN 1 AND 4",
    "5-9": "c.number_of_employees BETWEEN 5 AND 9",
    "10-19": "c.number_of_employees BETWEEN 10 AND 19",
    "20-49": "c.number_of_employees BETWEEN 20 AND 49",
    "50+": "c.number_of_employees >= 50",
  };

  if (employeeSql[filter.employees]) {
    clauses.push(employeeSql[filter.employees]);
  }

  if (filter.crmMode === "contacted") {
    clauses.push("COALESCE(p.status, 'Ny') <> 'Ny'");
  } else if (filter.crmMode === "active") {
    clauses.push("COALESCE(p.active_agreement, 0) = 1");
  } else if (filter.crmMode === "potential") {
    clauses.push(`
      COALESCE(p.status, 'Ny') = 'Ny'
      AND COALESCE(p.active_agreement, 0) = 0
      AND p.last_contact IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM activity_log AS potential_activity
        WHERE potential_activity.organisation_number = c.organisation_number
      )
    `);
  }

  return { sql: clauses.join(" AND "), parameters };
}

function parsedBrregContacts(rolesJson: string): Array<{
  name: string;
  role: string;
}> {
  try {
    const source = JSON.parse(rolesJson) as {
      rollegrupper?: Array<{
        roller?: Array<{
          type?: { beskrivelse?: string; kode?: string };
          person?: {
            navn?: {
              fornavn?: string;
              mellomnavn?: string;
              etternavn?: string;
            };
          };
        }>;
      }>;
    };

    const result: Array<{ name: string; role: string }> = [];

    for (const group of source.rollegrupper ?? []) {
      for (const item of group.roller ?? []) {
        const nameObject = item.person?.navn;
        if (!nameObject) continue;

        const name = [
          nameObject.fornavn,
          nameObject.mellomnavn,
          nameObject.etternavn,
        ].filter(Boolean).join(" ");

        if (name) {
          result.push({
            name,
            role: item.type?.beskrivelse ?? item.type?.kode ?? "Rolle",
          });
        }
      }
    }

    return result;
  } catch {
    return [];
  }
}

app.get("/api/industries", (_request, response) => {
  response.json(
    db.prepare(`
      SELECT
        code,
        description,
        company_count AS companyCount,
        imported_count AS importedCount,
        imported_at AS importedAt
      FROM industries
      WHERE imported_count > 0
      ORDER BY imported_count DESC, code
    `).all(),
  );
});

app.get("/api/summary", (request, response) => {
  const industry = industryValue(request.query.industry);
  const segment = segmentClause(industry);

  const row = db.prepare(`
    SELECT
      COUNT(*) AS totalCompanies,
      COUNT(DISTINCT c.accounting_firm_organisation_number)
        AS registeredAccountingFirms,
      SUM(CASE WHEN COALESCE(p.status, 'Ny') = 'Ny' THEN 1 ELSE 0 END)
        AS notContacted,
      SUM(CASE WHEN COALESCE(p.status, 'Ny') <> 'Ny' THEN 1 ELSE 0 END)
        AS contacted,
      SUM(CASE WHEN COALESCE(p.active_agreement, 0) = 1 THEN 1 ELSE 0 END)
        AS activeAgreements,
      SUM(
        CASE
          WHEN COALESCE(p.status, 'Ny')
            NOT IN ('Ikke aktuell', 'Kunde', 'Aktiv avtale')
           AND COALESCE(p.active_agreement, 0) = 0
          THEN 1 ELSE 0
        END
      ) AS potentialCustomers
    ${segmentFrom}
    WHERE ${segment.sql}
  `).get(...segment.parameters) as Record<string, number | null>;

  response.json(
    Object.fromEntries(
      Object.entries(row).map(([key, item]) => [key, item ?? 0]),
    ),
  );
});

app.get("/api/options", (request, response) => {
  const industry = industryValue(request.query.industry);
  const segment = segmentClause(industry);
  const common = `
    ${segmentFrom}
    WHERE ${segment.sql}
  `;

  response.json({
    municipalities: db.prepare(`
      SELECT c.municipality AS value, COUNT(*) AS count
      ${common}
        AND c.municipality IS NOT NULL
      GROUP BY c.municipality
      ORDER BY c.municipality COLLATE NOCASE
    `).all(...segment.parameters),

    firms: db.prepare(`
      SELECT c.accounting_firm_name AS value, COUNT(*) AS count
      ${common}
        AND c.accounting_firm_name IS NOT NULL
      GROUP BY c.accounting_firm_name
      ORDER BY COUNT(*) DESC
    `).all(...segment.parameters),

    organisationForms: db.prepare(`
      SELECT c.organisation_form AS value, COUNT(*) AS count
      ${common}
        AND c.organisation_form IS NOT NULL
      GROUP BY c.organisation_form
      ORDER BY c.organisation_form COLLATE NOCASE
    `).all(...segment.parameters),
  });
});

app.get("/api/companies", (request, response) => {
  const filter = parseFilter(request.query);
  const where = companyWhere(filter);
  const page = integer(request.query.page, 1, 1, 100000);
  const pageSize = integer(request.query.pageSize, 50, 10, 250);

  const sortColumns: Record<string, string> = {
    name: "c.name COLLATE NOCASE",
    municipality: "c.municipality COLLATE NOCASE",
    employees: "c.number_of_employees",
    accountingFirm: "c.accounting_firm_name COLLATE NOCASE",
    prospectStatus: "COALESCE(p.status, 'Ny') COLLATE NOCASE",
    nextContact: "p.next_contact",
  };

  const sort = sortColumns[value(request.query.sort)] ?? sortColumns.name;
  const direction =
    value(request.query.direction).toLowerCase() === "desc" ? "DESC" : "ASC";

  const total = (
    db.prepare(`
      SELECT COUNT(*) AS count
      ${segmentFrom}
      WHERE ${where.sql}
    `).get(...where.parameters) as { count: number }
  ).count;

  const items = db.prepare(`
    SELECT
      c.organisation_number AS organisationNumber,
      c.name,
      c.organisation_form AS organisationForm,
      c.industry_code AS industryCode,
      c.industry_description AS industryDescription,
      COALESCE(p.status, 'Ny') AS prospectStatus,
      p.responsible,
      p.last_contact AS lastContact,
      p.next_contact AS nextContact,
      COALESCE(p.active_agreement, 0) AS activeAgreement
    ${segmentFrom}
    WHERE ${where.sql}
    ORDER BY ${sort} ${direction}
    LIMIT ? OFFSET ?
  `).all(
    ...where.parameters,
    pageSize,
    (page - 1) * pageSize,
  );

  response.json({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

app.get("/api/firms", (request, response) => {
  const industry = industryValue(request.query.industry);
  const segment = segmentClause(industry);
  const q = value(request.query.q);
  const page = integer(request.query.page, 1, 1, 100000);
  const pageSize = integer(request.query.pageSize, 50, 10, 250);
  const parameters: unknown[] = [...segment.parameters];
  let search = "";

  if (q) {
    search = `
      AND COALESCE(
        c.accounting_firm_name,
        'Ikke registrert regnskapsforetak'
      ) LIKE ?
    `;
    parameters.push(`%${q}%`);
  }

  const grouped = `
    SELECT
      COALESCE(
        c.accounting_firm_name,
        'Ikke registrert regnskapsforetak'
      ) AS firm_name,
      c.accounting_firm_organisation_number AS firm_orgnr,
      COUNT(*) AS company_count,
      COUNT(DISTINCT c.municipality) AS municipality_count
    ${segmentFrom}
    WHERE
      ${segment.sql}
      ${search}
    GROUP BY
      c.accounting_firm_name,
      c.accounting_firm_organisation_number
  `;

  const total = (
    db.prepare(`SELECT COUNT(*) AS count FROM (${grouped})`)
      .get(...parameters) as { count: number }
  ).count;

  const items = db.prepare(`
    SELECT
      firm_name AS accountingFirmName,
      firm_orgnr AS accountingFirmOrganisationNumber,
      company_count AS companyCount,
      municipality_count AS municipalityCount
    FROM (${grouped})
    ORDER BY company_count DESC, firm_name COLLATE NOCASE
    LIMIT ? OFFSET ?
  `).all(...parameters, pageSize, (page - 1) * pageSize);

  response.json({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

app.get("/api/companies/:organisationNumber", (request, response) => {
  const organisationNumber = value(request.params.organisationNumber);

  const company = db.prepare(`
    SELECT
      c.*,
      COALESCE(p.status, 'Ny') AS prospect_status,
      p.note AS prospect_note,
      p.next_contact,
      p.responsible,
      COALESCE(p.active_agreement, 0) AS active_agreement,
      p.agreement_type,
      p.agreement_start,
      p.agreement_end
    FROM companies AS c
    LEFT JOIN prospect_notes AS p
      ON p.organisation_number = c.organisation_number
    WHERE c.organisation_number = ?
  `).get(organisationNumber) as Record<string, unknown> | undefined;

  if (!company) {
    response.status(404).json({ error: "Selskapet ble ikke funnet." });
    return;
  }

  response.json({
    company,
    brregContacts: parsedBrregContacts(String(company.roles_json ?? "{}")),
    contacts: db.prepare(`
      SELECT
        id, name, role, email, phone,
        is_primary AS isPrimary, note
      FROM company_contacts
      WHERE organisation_number = ?
      ORDER BY is_primary DESC, name COLLATE NOCASE
    `).all(organisationNumber),
    history: db.prepare(`
      SELECT
        activity_type AS activityType,
        comment,
        responsible,
        activity_date AS activityDate
      FROM activity_log
      WHERE organisation_number = ?
      ORDER BY activity_date DESC, id DESC
      LIMIT 100
    `).all(organisationNumber),
    tasks: db.prepare(`
      SELECT id, title, description, status, priority,
        due_date AS dueDate, responsible
      FROM tasks
      WHERE organisation_number = ?
      ORDER BY CASE status WHEN 'Ferdig' THEN 1 ELSE 0 END,
        due_date IS NULL, due_date, id DESC
    `).all(organisationNumber),
    integrations: db.prepare(`
      SELECT i.id, i.product_code AS productCode, p.name AS productName,
        i.status, i.last_sync_at AS lastSyncAt,
        i.last_success_at AS lastSuccessAt, i.last_error AS lastError
      FROM integrations AS i
      LEFT JOIN products AS p ON p.code = i.product_code
      WHERE i.organisation_number = ?
      ORDER BY p.name COLLATE NOCASE
    `).all(organisationNumber),
  });
});

app.put("/api/prospects/:organisationNumber", (request, response) => {
  const organisationNumber = value(request.params.organisationNumber);
  const status = value(request.body?.status || "Ny");
  const note = value(request.body?.note) || null;
  const responsible = value(request.body?.responsible) || null;
  const nextContact = value(request.body?.nextContact) || null;
  const activeAgreement = request.body?.activeAgreement ? 1 : 0;
  const agreementType = value(request.body?.agreementType) || null;
  const agreementStart = value(request.body?.agreementStart) || null;
  const agreementEnd = value(request.body?.agreementEnd) || null;
  const now = new Date().toISOString();
  const contactDate = status !== "Ny" ? now.slice(0, 10) : null;

  db.prepare(`
    INSERT INTO prospect_notes (
      organisation_number, status, note, next_contact,
      first_contact, last_contact, responsible,
      active_agreement, agreement_type,
      agreement_start, agreement_end, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(organisation_number) DO UPDATE SET
      status = excluded.status,
      note = excluded.note,
      next_contact = excluded.next_contact,
      first_contact = COALESCE(
        prospect_notes.first_contact,
        excluded.first_contact
      ),
      last_contact = excluded.last_contact,
      responsible = excluded.responsible,
      active_agreement = excluded.active_agreement,
      agreement_type = excluded.agreement_type,
      agreement_start = excluded.agreement_start,
      agreement_end = excluded.agreement_end,
      updated_at = excluded.updated_at
  `).run(
    organisationNumber,
    status,
    note,
    nextContact,
    contactDate,
    contactDate,
    responsible,
    activeAgreement,
    agreementType,
    agreementStart,
    agreementEnd,
    now,
  );

  db.prepare(`
    INSERT INTO activity_log (
      organisation_number, activity_type, comment,
      responsible, activity_date, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    organisationNumber,
    activeAgreement ? "Avtale" : "Statusoppdatering",
    note,
    responsible,
    now.slice(0, 10),
    now,
  );

  response.json({ ok: true });
});

app.post("/api/contacts/:organisationNumber", (request, response) => {
  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO company_contacts (
      organisation_number, name, role, email, phone,
      is_primary, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    value(request.params.organisationNumber),
    value(request.body?.name),
    value(request.body?.role) || null,
    value(request.body?.email) || null,
    value(request.body?.phone) || null,
    request.body?.isPrimary ? 1 : 0,
    value(request.body?.note) || null,
    now,
    now,
  );

  response.json({ ok: true, id: result.lastInsertRowid });
});


app.post("/api/batch/preview", (request, response) => {
  const source = request.body?.filters ?? {};
  const filter: Filter = {
    industry: industryValue(source.industry),
    q: value(source.q),
    firm: value(source.firm),
    municipality: value(source.municipality),
    employees: value(source.employees),
    organisationForm: value(source.organisationForm),
    prospectStatus: value(source.prospectStatus),
    crmMode: value(source.crmMode),
  };

  const where = companyWhere(filter);
  const clauses = [where.sql];
  const parameters = [...where.parameters];

  if (request.body?.onlyUncontacted) {
    clauses.push("COALESCE(p.status, 'Ny') = 'Ny'");
  }
  if (request.body?.onlyWithoutResponsible) {
    clauses.push("(p.responsible IS NULL OR TRIM(p.responsible) = '')");
  }
  if (request.body?.onlyWithoutHistory) {
    clauses.push(`NOT EXISTS (
      SELECT 1 FROM activity_log AS a
      WHERE a.organisation_number = c.organisation_number
    )`);
  }

  const count = (
    db.prepare(`
      SELECT COUNT(*) AS count
      ${segmentFrom}
      WHERE ${clauses.join(" AND ")}
    `).get(...parameters) as { count: number }
  ).count;

  response.json({ count });
});

app.post("/api/batch/update", (request, response) => {
  const source = request.body?.filters ?? {};
  const filter: Filter = {
    industry: industryValue(source.industry),
    q: value(source.q),
    firm: value(source.firm),
    municipality: value(source.municipality),
    employees: value(source.employees),
    organisationForm: value(source.organisationForm),
    prospectStatus: value(source.prospectStatus),
    crmMode: value(source.crmMode),
  };

  const action = value(request.body?.action || "comment");
  const responsible = value(request.body?.responsible) || null;
  const comment = value(request.body?.comment) || null;
  const activityDate =
    value(request.body?.activityDate) || new Date().toISOString().slice(0, 10);
  const nextContact = value(request.body?.nextContact) || null;
  const requestedStatus = value(request.body?.status) || null;
  const agreementStatus = value(request.body?.agreementStatus) || null;

  const statusForAction: Record<string, string | null> = {
    comment: null,
    email: "Kontaktet",
    status: requestedStatus,
    responsible: null,
    nextContact: null,
    meeting: "Møte booket",
    offer: "Tilbud sendt",
    notRelevant: "Ikke aktuell",
    agreement: agreementStatus === "active" ? "Aktiv avtale" : null,
  };

  if (!(action in statusForAction)) {
    response.status(400).json({ error: "Ukjent massehandling." });
    return;
  }

  if (action === "status" && !requestedStatus) {
    response.status(400).json({ error: "Velg ny status." });
    return;
  }

  if (action === "nextContact" && !nextContact) {
    response.status(400).json({ error: "Velg dato for neste kontakt." });
    return;
  }

  if (action === "agreement" && !agreementStatus) {
    response.status(400).json({ error: "Velg avtalestatus." });
    return;
  }

  const where = companyWhere(filter);
  const clauses = [where.sql];
  const parameters = [...where.parameters];

  if (request.body?.onlyUncontacted) {
    clauses.push("COALESCE(p.status, 'Ny') = 'Ny'");
  }
  if (request.body?.onlyWithoutResponsible) {
    clauses.push("(p.responsible IS NULL OR TRIM(p.responsible) = '')");
  }
  if (request.body?.onlyWithoutHistory) {
    clauses.push(`NOT EXISTS (
      SELECT 1 FROM activity_log AS a
      WHERE a.organisation_number = c.organisation_number
    )`);
  }

  const companies = db.prepare(`
    SELECT c.organisation_number AS organisationNumber, c.name
    ${segmentFrom}
    WHERE ${clauses.join(" AND ")}
    ORDER BY c.name COLLATE NOCASE
  `).all(...parameters) as Array<{
    organisationNumber: string;
    name: string;
  }>;

  if (companies.length === 0) {
    response.status(400).json({ error: "Ingen selskaper passer med utvalget." });
    return;
  }

  if (companies.length > 10000 && !request.body?.confirmedLargeSelection) {
    response.status(409).json({
      error: "Utvalget er større enn 10 000 selskaper.",
      requiresConfirmation: true,
      count: companies.length,
    });
    return;
  }

  const now = new Date().toISOString();
  const actionStatus = statusForAction[action];

  const actionLabels: Record<string, string> = {
    comment: "Kommentar",
    email: "E-post sendt",
    status: `Status endret til ${requestedStatus}`,
    responsible: "Ansvarlig satt",
    nextContact: "Neste kontakt satt",
    meeting: "Møte booket",
    offer: "Tilbud sendt",
    notRelevant: "Ikke aktuell",
    agreement: agreementStatus === "active"
      ? "Aktiv avtale registrert"
      : "Aktiv avtale fjernet",
  };

  const automaticText = `${actionLabels[action]} ${activityDate} som masseoppdatering på ${companies.length.toLocaleString("nb-NO")} selskaper.`;
  const completeComment = comment ? `${automaticText}\n\n${comment}` : automaticText;

  const upsert = db.prepare(`
    INSERT INTO prospect_notes (
      organisation_number,
      status,
      note,
      next_contact,
      first_contact,
      last_contact,
      responsible,
      active_agreement,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(organisation_number) DO UPDATE SET
      status = COALESCE(?, prospect_notes.status),
      note = COALESCE(?, prospect_notes.note),
      next_contact = COALESCE(?, prospect_notes.next_contact),
      first_contact = COALESCE(prospect_notes.first_contact, ?),
      last_contact = COALESCE(?, prospect_notes.last_contact),
      responsible = COALESCE(?, prospect_notes.responsible),
      active_agreement = CASE
        WHEN ? = 'Aktiv avtale' THEN 1
        WHEN ? = 'Avtale deaktivert' THEN 0
        ELSE prospect_notes.active_agreement
      END,
      updated_at = ?
  `);

  const insertActivity = db.prepare(`
    INSERT INTO activity_log (
      organisation_number,
      activity_type,
      comment,
      responsible,
      activity_date,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const company of companies) {
      const contactDate =
        ["email", "meeting", "offer"].includes(action) ||
        (action === "status" && requestedStatus !== "Ny")
          ? activityDate
          : null;

      upsert.run(
        company.organisationNumber,
        actionStatus ?? "Ny",
        comment,
        action === "nextContact" ? nextContact : null,
        contactDate,
        contactDate,
        responsible,
        action === "agreement"
          ? (agreementStatus === "active" ? 1 : 0)
          : (actionStatus === "Aktiv avtale" ? 1 : 0),
        now,
        actionStatus,
        comment,
        action === "nextContact" ? nextContact : null,
        contactDate,
        contactDate,
        responsible,
        actionStatus,
        action === "agreement" && agreementStatus === "inactive"
          ? "Avtale deaktivert"
          : actionStatus,
        now,
      );

      insertActivity.run(
        company.organisationNumber,
        actionLabels[action],
        completeComment,
        responsible,
        activityDate,
        now,
      );
    }
  })();

  response.json({
    ok: true,
    updated: companies.length,
    message: automaticText,
  });
});

app.post("/api/firms/batch-comment", (request, response) => {
  const industry = industryValue(request.body?.industry);
  const firm = value(request.body?.firm);
  const commentInput = value(request.body?.comment);
  const responsible = value(request.body?.responsible) || null;
  const onlyUncontacted = Boolean(request.body?.onlyUncontacted);
  const emailSent = Boolean(request.body?.emailSent);
  const markContacted = Boolean(request.body?.markContacted);
  const sentDate = value(request.body?.sentDate) || new Date().toISOString().slice(0, 10);

  if (industry === "__ALL__") {
    response.status(400).json({
      error: "Velg ett konkret næringssegment før du registrerer en felles utsendelse.",
    });
    return;
  }

  if (!firm) {
    response.status(400).json({ error: "Velg et regnskapsforetak." });
    return;
  }

  const industryRow = db.prepare(`
    SELECT description
    FROM industries
    WHERE code = ?
  `).get(industry) as { description: string } | undefined;

  const industryDescription = industryRow?.description ?? industry;
  const extra = onlyUncontacted
    ? "AND COALESCE(p.status, 'Ny') = 'Ny'"
    : "";

  const segment = segmentClause(industry);

  const companies = db.prepare(`
    SELECT
      c.organisation_number AS organisationNumber,
      c.name
    ${segmentFrom}
    WHERE
      ${segment.sql}
      AND c.accounting_firm_name = ?
      ${extra}
    ORDER BY c.name COLLATE NOCASE
  `).all(...segment.parameters, firm) as Array<{
    organisationNumber: string;
    name: string;
  }>;

  if (companies.length === 0) {
    response.status(400).json({ error: "Ingen selskaper passer med utvalget." });
    return;
  }

  const dateNb = sentDate.split("-").reverse().join(".");
  const automaticText = emailSent
    ? `E-post sendt ${dateNb} til ${companies.length.toLocaleString("nb-NO")} selskaper innenfor ${industry} – ${industryDescription}, som har ${firm} som registrert regnskapsforetak.`
    : `Felleskommentar registrert ${dateNb} på ${companies.length.toLocaleString("nb-NO")} selskaper innenfor ${industry} – ${industryDescription}, som har ${firm} som registrert regnskapsforetak.`;

  const completeComment = commentInput
    ? `${automaticText}\n\n${commentInput}`
    : automaticText;

  const now = new Date().toISOString();

  const insertActivity = db.prepare(`
    INSERT INTO activity_log (
      organisation_number, activity_type, comment,
      responsible, activity_date, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  const upsertContacted = db.prepare(`
    INSERT INTO prospect_notes (
      organisation_number,
      status,
      first_contact,
      last_contact,
      responsible,
      updated_at
    ) VALUES (?, 'Kontaktet', ?, ?, ?, ?)
    ON CONFLICT(organisation_number) DO UPDATE SET
      status = CASE
        WHEN prospect_notes.status = 'Ny' THEN 'Kontaktet'
        ELSE prospect_notes.status
      END,
      first_contact = COALESCE(prospect_notes.first_contact, excluded.first_contact),
      last_contact = excluded.last_contact,
      responsible = COALESCE(excluded.responsible, prospect_notes.responsible),
      updated_at = excluded.updated_at
  `);

  const insertCampaign = db.prepare(`
    INSERT INTO email_campaigns (
      sent_date,
      industry_code,
      industry_description,
      accounting_firm_name,
      comment,
      responsible,
      recipient_count,
      only_uncontacted,
      marked_contacted,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertRecipient = db.prepare(`
    INSERT INTO email_campaign_recipients (
      campaign_id,
      organisation_number,
      company_name
    ) VALUES (?, ?, ?)
  `);

  const campaignId = db.transaction(() => {
    let createdCampaignId: number | null = null;

    if (emailSent) {
      const campaignResult = insertCampaign.run(
        sentDate,
        industry,
        industryDescription,
        firm,
        completeComment,
        responsible,
        companies.length,
        onlyUncontacted ? 1 : 0,
        markContacted ? 1 : 0,
        now,
      );
      createdCampaignId = Number(campaignResult.lastInsertRowid);
    }

    for (const company of companies) {
      insertActivity.run(
        company.organisationNumber,
        emailSent ? "E-post sendt" : "Felleskommentar",
        completeComment,
        responsible,
        sentDate,
        now,
      );

      if (markContacted) {
        upsertContacted.run(
          company.organisationNumber,
          sentDate,
          sentDate,
          responsible,
          now,
        );
      }

      if (createdCampaignId !== null) {
        insertRecipient.run(
          createdCampaignId,
          company.organisationNumber,
          company.name,
        );
      }
    }

    return createdCampaignId;
  })();

  response.json({
    ok: true,
    updated: companies.length,
    campaignId,
    message: automaticText,
    recipients: companies,
  });
});

app.get("/api/email-campaigns", (_request, response) => {
  response.json(
    db.prepare(`
      SELECT
        id,
        sent_date AS sentDate,
        industry_code AS industryCode,
        industry_description AS industryDescription,
        accounting_firm_name AS accountingFirmName,
        comment,
        responsible,
        recipient_count AS recipientCount,
        marked_contacted AS markedContacted
      FROM email_campaigns
      ORDER BY sent_date DESC, id DESC
      LIMIT 200
    `).all(),
  );
});

function exportRows(filter: Filter): unknown[] {
  const where = companyWhere(filter);
  return db.prepare(`
    SELECT
      c.organisation_number AS Organisasjonsnummer,
      c.name AS Selskapsnavn,
      c.organisation_form AS Organisasjonsform,
      c.address AS Adresse,
      c.postal_code AS Postnummer,
      c.postal_place AS Poststed,
      c.municipality AS Kommune,
      c.number_of_employees AS "Antall ansatte",
      c.accounting_firm_name AS Regnskapsforetak,
      COALESCE(p.status, 'Ny') AS Prospektstatus,
      p.responsible AS Ansvarlig,
      p.next_contact AS "Neste kontakt",
      COALESCE(p.active_agreement, 0) AS "Aktiv avtale"
    ${segmentFrom}
    WHERE ${where.sql}
    ORDER BY c.name COLLATE NOCASE
  `).all(...where.parameters);
}

app.get("/api/export/companies.xlsx", (request, response) => {
  const filter = parseFilter(request.query);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(exportRows(filter)),
    "Selskaper",
  );

  response
    .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .set(
      "Content-Disposition",
      `attachment; filename="segment-${filter.industry}-companies.xlsx"`,
    )
    .send(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
});

app.get("/api/export/companies.csv", (request, response) => {
  const filter = parseFilter(request.query);
  const sheet = XLSX.utils.json_to_sheet(exportRows(filter));
  const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ";" });

  response
    .type("text/csv; charset=utf-8")
    .set(
      "Content-Disposition",
      `attachment; filename="segment-${filter.industry}-companies.csv"`,
    )
    .send("\uFEFF" + csv);
});


app.get("/api/dashboard", (_request, response) => {
  const today = new Date().toISOString().slice(0, 10);
  const pipeline = db.prepare(`
    SELECT COALESCE(status, 'Ny') AS status, COUNT(*) AS count
    FROM prospect_notes
    GROUP BY COALESCE(status, 'Ny')
    ORDER BY count DESC
  `).all();

  const taskSummary = db.prepare(`
    SELECT
      SUM(CASE WHEN status <> 'Ferdig' THEN 1 ELSE 0 END) AS openTasks,
      SUM(CASE WHEN status <> 'Ferdig' AND due_date < ? THEN 1 ELSE 0 END) AS overdueTasks,
      SUM(CASE WHEN status <> 'Ferdig' AND due_date = ? THEN 1 ELSE 0 END) AS dueToday
    FROM tasks
  `).get(today, today) as Record<string, number | null>;

  const followUps = db.prepare(`
    SELECT c.organisation_number AS organisationNumber, c.name,
      p.next_contact AS nextContact, p.responsible,
      COALESCE(p.status, 'Ny') AS status
    FROM prospect_notes AS p
    JOIN companies AS c ON c.organisation_number = p.organisation_number
    WHERE p.next_contact IS NOT NULL AND p.next_contact <= ?
      AND COALESCE(p.status, 'Ny') NOT IN ('Ikke aktuell')
    ORDER BY p.next_contact, c.name COLLATE NOCASE
    LIMIT 20
  `).all(today);

  const tasks = db.prepare(`
    SELECT t.id, t.organisation_number AS organisationNumber,
      c.name AS companyName, t.title, t.status, t.priority,
      t.due_date AS dueDate, t.responsible
    FROM tasks AS t
    LEFT JOIN companies AS c ON c.organisation_number = t.organisation_number
    WHERE t.status <> 'Ferdig'
    ORDER BY t.due_date IS NULL, t.due_date, t.id DESC
    LIMIT 20
  `).all();

  const recentActivity = db.prepare(`
    SELECT a.organisation_number AS organisationNumber, c.name AS companyName,
      a.activity_type AS activityType, a.comment, a.responsible,
      a.activity_date AS activityDate
    FROM activity_log AS a
    LEFT JOIN companies AS c ON c.organisation_number = a.organisation_number
    ORDER BY a.activity_date DESC, a.id DESC
    LIMIT 15
  `).all();

  const integrationSummary = db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM integrations
    GROUP BY status
    ORDER BY count DESC
  `).all();

  response.json({
    pipeline,
    tasks: {
      open: taskSummary.openTasks ?? 0,
      overdue: taskSummary.overdueTasks ?? 0,
      dueToday: taskSummary.dueToday ?? 0,
      items: tasks,
    },
    followUps,
    recentActivity,
    integrationSummary,
  });
});

app.post("/api/tasks", (request, response) => {
  const title = value(request.body?.title);
  if (!title) {
    response.status(400).json({ error: "Oppgaven må ha en tittel." });
    return;
  }
  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO tasks (
      organisation_number, title, description, status, priority,
      due_date, responsible, created_at, updated_at
    ) VALUES (?, ?, ?, 'Åpen', ?, ?, ?, ?, ?)
  `).run(
    value(request.body?.organisationNumber) || null,
    title,
    value(request.body?.description) || null,
    value(request.body?.priority || "Normal"),
    value(request.body?.dueDate) || null,
    value(request.body?.responsible) || null,
    now,
    now,
  );
  response.status(201).json({ ok: true, id: result.lastInsertRowid });
});

app.patch("/api/tasks/:id", (request, response) => {
  const id = integer(request.params.id, 0, 1, Number.MAX_SAFE_INTEGER);
  const current = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!current) {
    response.status(404).json({ error: "Oppgaven ble ikke funnet." });
    return;
  }
  const status = value(request.body?.status ?? current.status);
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE tasks SET
      title = ?, description = ?, status = ?, priority = ?, due_date = ?,
      responsible = ?, completed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    value(request.body?.title ?? current.title),
    value(request.body?.description ?? current.description) || null,
    status,
    value(request.body?.priority ?? current.priority),
    value(request.body?.dueDate ?? current.due_date) || null,
    value(request.body?.responsible ?? current.responsible) || null,
    status === "Ferdig" ? now : null,
    now,
    id,
  );
  response.json({ ok: true });
});

app.get("/api/v1/products", (_request, response) => {
  response.json({
    items: db.prepare(`
      SELECT code, name, description, status,
        created_at AS createdAt, updated_at AS updatedAt
      FROM products ORDER BY name COLLATE NOCASE
    `).all(),
  });
});

app.get("/api/v1/customers/:organisationNumber", (request, response) => {
  const organisationNumber = value(request.params.organisationNumber);
  const customer = db.prepare(`
    SELECT c.organisation_number AS organisationNumber, c.name,
      c.address, c.postal_code AS postalCode, c.postal_place AS postalPlace,
      c.municipality, COALESCE(p.status, 'Ny') AS crmStatus,
      COALESCE(p.active_agreement, 0) AS activeAgreement,
      p.agreement_type AS agreementType, p.agreement_start AS agreementStart,
      p.agreement_end AS agreementEnd
    FROM companies AS c
    LEFT JOIN prospect_notes AS p ON p.organisation_number = c.organisation_number
    WHERE c.organisation_number = ?
  `).get(organisationNumber);
  if (!customer) {
    response.status(404).json({ error: "Kunden ble ikke funnet." });
    return;
  }
  response.json({
    customer,
    products: db.prepare(`
      SELECT product_code AS productCode, status, subscription_status AS subscriptionStatus,
        start_date AS startDate, end_date AS endDate
      FROM customer_products WHERE organisation_number = ?
    `).all(organisationNumber),
    integrations: db.prepare(`
      SELECT id, product_code AS productCode, status,
        last_sync_at AS lastSyncAt, last_success_at AS lastSuccessAt,
        last_error AS lastError
      FROM integrations WHERE organisation_number = ?
    `).all(organisationNumber),
  });
});

app.post("/api/v1/integration-orders", (request, response) => {
  const organisationNumber = value(request.body?.organisationNumber);
  const productCode = value(request.body?.productCode);
  if (!/^\\d{9}$/.test(organisationNumber) || !productCode) {
    response.status(400).json({ error: "Organisasjonsnummer og produktkode er påkrevd." });
    return;
  }
  const exists = db.prepare("SELECT 1 FROM companies WHERE organisation_number = ?").get(organisationNumber);
  if (!exists) {
    response.status(404).json({ error: "Selskapet finnes ikke i Business Hub." });
    return;
  }
  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO customer_products (
        organisation_number, product_code, status, subscription_status,
        external_order_id, created_at, updated_at
      ) VALUES (?, ?, 'Bestilt', 'Ikke aktiv', ?, ?, ?)
      ON CONFLICT(organisation_number, product_code) DO UPDATE SET
        status = 'Bestilt', external_order_id = excluded.external_order_id,
        updated_at = excluded.updated_at
    `).run(organisationNumber, productCode, value(request.body?.externalOrderId) || null, now, now);
    const result = db.prepare(`
      INSERT INTO integrations (
        organisation_number, product_code, status, external_id, created_at, updated_at
      ) VALUES (?, ?, 'Venter på oppsett', ?, ?, ?)
      ON CONFLICT(organisation_number, product_code) DO UPDATE SET
        status = 'Venter på oppsett', external_id = excluded.external_id,
        updated_at = excluded.updated_at
      RETURNING id
    `).get(organisationNumber, productCode, value(request.body?.externalIntegrationId) || null, now, now) as { id: number };
    db.prepare(`
      INSERT INTO integration_events (integration_id, event_type, message, occurred_at, created_at)
      VALUES (?, 'ORDER_CREATED', ?, ?, ?)
    `).run(result.id, "Integrasjonsordre registrert i Business Hub.", now, now);
    return result.id;
  });
  const integrationId = transaction();
  response.status(201).json({ ok: true, integrationId });
});

app.patch("/api/v1/integrations/:id/status", (request, response) => {
  const id = integer(request.params.id, 0, 1, Number.MAX_SAFE_INTEGER);
  const status = value(request.body?.status);
  if (!status) {
    response.status(400).json({ error: "Status er påkrevd." });
    return;
  }
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE integrations SET status = ?, last_sync_at = ?,
      last_success_at = CASE WHEN ? = 'Aktiv' THEN ? ELSE last_success_at END,
      last_error = ?, updated_at = ?
    WHERE id = ?
  `).run(status, value(request.body?.lastSyncAt) || null, status, now,
    value(request.body?.lastError) || null, now, id);
  if (!result.changes) {
    response.status(404).json({ error: "Integrasjonen ble ikke funnet." });
    return;
  }
  db.prepare(`
    INSERT INTO integration_events (integration_id, event_type, message, metadata_json, occurred_at, created_at)
    VALUES (?, 'STATUS_CHANGED', ?, ?, ?, ?)
  `).run(id, `Status endret til ${status}.`, JSON.stringify(request.body ?? {}), now, now);
  response.json({ ok: true });
});

app.get("/{*splat}", (_request, response) => {
  response.sendFile(path.resolve("public/index.html"));
});

app.listen(config.port, () => {
  console.log(`Business Hub v6.0: http://localhost:${config.port}`);
});
