import fs from "node:fs";
import path from "node:path";
import type { Express } from "express";
import { config } from "./config.js";
import { db } from "./db.js";

const CONFIRMATION_TEXT = "SLETT ALLE DATA";

const dataTables = [
  "integration_events",
  "integrations",
  "customer_products",
  "email_campaign_recipients",
  "email_campaigns",
  "company_contacts",
  "activity_log",
  "tasks",
  "prospect_notes",
  "targets",
  "industries",
  "companies",
] as const;

function count(table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
}

function dataSummary() {
  const tables = Object.fromEntries(dataTables.map((table) => [table, count(table)]));
  return {
    companies: tables.companies ?? 0,
    industries: tables.industries ?? 0,
    targets: tables.targets ?? 0,
    contacts: tables.company_contacts ?? 0,
    activities: tables.activity_log ?? 0,
    tasks: tables.tasks ?? 0,
    campaigns: tables.email_campaigns ?? 0,
    integrations: tables.integrations ?? 0,
    customerProducts: tables.customer_products ?? 0,
    tables,
  };
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function registerAdminRoutes(app: Express): void {
  app.get("/api/admin/data-summary", (_request, response) => {
    response.json({
      ...dataSummary(),
      confirmationText: CONFIRMATION_TEXT,
      databasePath: config.databasePath,
    });
  });

  app.post("/api/admin/reset-data", async (request, response) => {
    const step1 = request.body?.step1 === true;
    const step2 = request.body?.step2 === true;
    const confirmation = String(request.body?.confirmation ?? "").trim();

    if (!step1 || !step2 || confirmation !== CONFIRMATION_TEXT) {
      response.status(400).json({
        error: "Alle kontrollsteg må fullføres før data kan slettes.",
      });
      return;
    }

    const before = dataSummary();
    const backupPath = path.join(
      path.dirname(config.databasePath),
      `backup-before-reset-${timestamp()}.sqlite`,
    );

    fs.mkdirSync(path.dirname(backupPath), { recursive: true });

    try {
      await db.backup(backupPath);

      db.transaction(() => {
        for (const table of dataTables) {
          db.prepare(`DELETE FROM ${table}`).run();
        }

        // Nullstill løpenummer for tabeller som bruker AUTOINCREMENT.
        const sequenceTableExists = db.prepare(`
          SELECT 1 FROM sqlite_master
          WHERE type = 'table' AND name = 'sqlite_sequence'
        `).get();

        if (sequenceTableExists) {
          const placeholders = dataTables.map(() => "?").join(", ");
          db.prepare(`DELETE FROM sqlite_sequence WHERE name IN (${placeholders})`)
            .run(...dataTables);
        }
      })();

      response.json({
        ok: true,
        message: "Alle operative data er slettet. Databasestruktur og produktdefinisjoner er beholdt.",
        backupPath,
        deleted: before,
        remaining: dataSummary(),
      });
    } catch (error) {
      response.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
