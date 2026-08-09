import type { Express } from "express";
import { db } from "./db.js";

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function parseRawJson(rawJson: unknown): Record<string, unknown> {
  try {
    return JSON.parse(String(rawJson ?? "{}")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 1 || value === "true" || value === "1";
}

function employeeClause(value: string): string | null {
  const clauses: Record<string, string> = {
    "0": "COALESCE(c.number_of_employees, 0) = 0",
    "1-4": "c.number_of_employees BETWEEN 1 AND 4",
    "5-9": "c.number_of_employees BETWEEN 5 AND 9",
    "10-19": "c.number_of_employees BETWEEN 10 AND 19",
    "20-49": "c.number_of_employees BETWEEN 20 AND 49",
    "50+": "c.number_of_employees >= 50",
  };
  return clauses[value] ?? null;
}

export function registerInsightRoutes(app: Express): void {
  app.get("/api/insights/company/:organisationNumber/status", (request, response) => {
    const organisationNumber = text(request.params.organisationNumber);
    const row = db.prepare(`
      SELECT raw_json AS rawJson
      FROM companies
      WHERE organisation_number = ?
    `).get(organisationNumber) as { rawJson?: string } | undefined;

    if (!row) {
      response.status(404).json({ error: "Selskapet ble ikke funnet." });
      return;
    }

    const raw = parseRawJson(row.rawJson);
    const bankruptcy = booleanValue(raw.konkurs);
    const liquidation = booleanValue(raw.underAvvikling);
    const compulsory = booleanValue(raw.underTvangsavviklingEllerTvangsopplosning);
    const bankruptcyDate = text(raw.konkursdato) || null;
    const deletedDate = text(raw.slettedato) || null;

    const warnings: string[] = [];
    if (bankruptcy) warnings.push("Konkurs");
    if (liquidation) warnings.push("Under avvikling");
    if (compulsory) warnings.push("Tvangsavvikling / tvangsoppløsning");
    if (deletedDate) warnings.push("Slettet fra Enhetsregisteret");

    response.json({
      organisationNumber,
      hasWarning: warnings.length > 0,
      warnings,
      bankruptcy,
      liquidation,
      compulsory,
      bankruptcyDate,
      deletedDate,
    });
  });

  // Fordeling av alle registrerte regnskapsforetak innenfor valgt segment/filtre.
  // Selskaper uten registrert regnskapsforetak holdes utenfor både teller og nevner.
  app.get("/api/insights/accounting-firm-distribution", (request, response) => {
    const industry = text(request.query.industry) || "__ALL__";
    const q = text(request.query.q);
    const municipality = text(request.query.municipality);
    const employees = text(request.query.employees);
    const organisationForm = text(request.query.organisationForm);

    const clauses = [
      "c.accounting_firm_name IS NOT NULL",
      "TRIM(c.accounting_firm_name) <> ''",
    ];
    const parameters: unknown[] = [];

    if (industry !== "__ALL__") {
      clauses.push(`EXISTS (
        SELECT 1 FROM targets AS t
        WHERE t.organisation_number = c.organisation_number
          AND t.industry_code = ?
          AND t.imported = 1
      )`);
      parameters.push(industry);
    } else {
      clauses.push(`EXISTS (
        SELECT 1 FROM targets AS t
        WHERE t.organisation_number = c.organisation_number
          AND t.imported = 1
      )`);
    }

    if (q) {
      const like = `%${q}%`;
      clauses.push(`(
        c.name LIKE ? OR c.organisation_number LIKE ?
        OR c.postal_place LIKE ? OR c.municipality LIKE ?
      )`);
      parameters.push(like, like, like, like);
    }

    if (municipality) {
      clauses.push("c.municipality = ?");
      parameters.push(municipality);
    }

    if (organisationForm) {
      clauses.push("c.organisation_form = ?");
      parameters.push(organisationForm);
    }

    const employeeSql = employeeClause(employees);
    if (employeeSql) clauses.push(employeeSql);

    const rows = db.prepare(`
      SELECT
        c.accounting_firm_name AS accountingFirmName,
        c.accounting_firm_organisation_number AS accountingFirmOrganisationNumber,
        COUNT(*) AS companyCount
      FROM companies AS c
      WHERE ${clauses.join(" AND ")}
      GROUP BY c.accounting_firm_name, c.accounting_firm_organisation_number
      ORDER BY companyCount DESC, c.accounting_firm_name COLLATE NOCASE
    `).all(...parameters) as Array<{
      accountingFirmName: string;
      accountingFirmOrganisationNumber: string | null;
      companyCount: number;
    }>;

    const total = rows.reduce((sum, row) => sum + Number(row.companyCount || 0), 0);

    response.json({
      industry,
      total,
      accountingFirms: rows.map((row) => ({
        ...row,
        share: total ? row.companyCount / total : 0,
      })),
    });
  });

  // Behold detaljvisningen for ett regnskapsforetak som separat API.
  app.get("/api/insights/accounting-firm-industries", (request, response) => {
    const firm = text(request.query.firm);
    if (!firm || firm === "__WITHOUT__") {
      response.status(400).json({ error: "Velg et registrert regnskapsforetak." });
      return;
    }

    const rows = db.prepare(`
      SELECT
        COALESCE(NULLIF(TRIM(industry_code), ''), 'Ukjent') AS industryCode,
        COALESCE(NULLIF(TRIM(industry_description), ''), 'Ukjent næring') AS industryDescription,
        COUNT(*) AS companyCount
      FROM companies
      WHERE accounting_firm_name = ?
        AND accounting_firm_name IS NOT NULL
      GROUP BY industry_code, industry_description
      ORDER BY companyCount DESC, industryCode
    `).all(firm) as Array<{
      industryCode: string;
      industryDescription: string;
      companyCount: number;
    }>;

    const total = rows.reduce((sum, row) => sum + Number(row.companyCount || 0), 0);

    response.json({
      firm,
      total,
      industries: rows.map((row) => ({
        ...row,
        share: total ? row.companyCount / total : 0,
      })),
    });
  });
}
