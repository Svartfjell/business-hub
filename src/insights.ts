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
