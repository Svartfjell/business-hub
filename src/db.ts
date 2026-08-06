import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

if (!fs.existsSync(config.databasePath)) {
  throw new Error(
    `Fant ikke databasen ${config.databasePath}. Kopier segment.sqlite til data-mappen.`,
  );
}

export const db = new Database(config.databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS prospect_notes (
    organisation_number TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'Ny',
    note TEXT,
    next_contact TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS company_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organisation_number TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    email TEXT,
    phone TEXT,
    is_primary INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organisation_number TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    comment TEXT,
    responsible TEXT,
    activity_date TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS email_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sent_date TEXT NOT NULL,
    industry_code TEXT NOT NULL,
    industry_description TEXT NOT NULL,
    accounting_firm_name TEXT NOT NULL,
    comment TEXT NOT NULL,
    responsible TEXT,
    recipient_count INTEGER NOT NULL,
    only_uncontacted INTEGER NOT NULL DEFAULT 0,
    marked_contacted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS email_campaign_recipients (
    campaign_id INTEGER NOT NULL,
    organisation_number TEXT NOT NULL,
    company_name TEXT NOT NULL,
    PRIMARY KEY (campaign_id, organisation_number),
    FOREIGN KEY (campaign_id)
      REFERENCES email_campaigns(id)
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_company_contacts_orgnr
    ON company_contacts (organisation_number);

  CREATE INDEX IF NOT EXISTS idx_activity_log_orgnr_date
    ON activity_log (organisation_number, activity_date DESC);

  CREATE INDEX IF NOT EXISTS idx_email_campaigns_date
    ON email_campaigns (sent_date DESC);

  CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_orgnr
    ON email_campaign_recipients (organisation_number);

  CREATE INDEX IF NOT EXISTS idx_targets_segment_imported
    ON targets (industry_code, imported, organisation_number);

  CREATE INDEX IF NOT EXISTS idx_companies_firm
    ON companies (accounting_firm_name);

  CREATE INDEX IF NOT EXISTS idx_companies_municipality
    ON companies (municipality);

  CREATE INDEX IF NOT EXISTS idx_companies_orgform
    ON companies (organisation_form);
`);

function columns(tableName: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
  }>;
  return new Set(rows.map((row) => row.name));
}

function addColumn(
  tableName: string,
  columnName: string,
  definition: string,
): void {
  if (!columns(tableName).has(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

addColumn("prospect_notes", "first_contact", "TEXT");
addColumn("prospect_notes", "last_contact", "TEXT");
addColumn("prospect_notes", "responsible", "TEXT");
addColumn("prospect_notes", "active_agreement", "INTEGER NOT NULL DEFAULT 0");
addColumn("prospect_notes", "agreement_type", "TEXT");
addColumn("prospect_notes", "agreement_start", "TEXT");
addColumn("prospect_notes", "agreement_end", "TEXT");


db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organisation_number TEXT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'Åpen',
    priority TEXT NOT NULL DEFAULT 'Normal',
    due_date TEXT,
    responsible TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'Planlagt',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS customer_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organisation_number TEXT NOT NULL,
    product_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Bestilt',
    subscription_status TEXT NOT NULL DEFAULT 'Ikke aktiv',
    start_date TEXT,
    end_date TEXT,
    external_order_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (organisation_number, product_code)
  );

  CREATE TABLE IF NOT EXISTS integrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organisation_number TEXT NOT NULL,
    product_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Ikke konfigurert',
    last_sync_at TEXT,
    last_success_at TEXT,
    last_error TEXT,
    external_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (organisation_number, product_code)
  );

  CREATE TABLE IF NOT EXISTS integration_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    integration_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    message TEXT,
    metadata_json TEXT,
    occurred_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_due_status ON tasks (status, due_date);
  CREATE INDEX IF NOT EXISTS idx_tasks_orgnr ON tasks (organisation_number);
  CREATE INDEX IF NOT EXISTS idx_customer_products_orgnr ON customer_products (organisation_number);
  CREATE INDEX IF NOT EXISTS idx_integrations_orgnr ON integrations (organisation_number);
  CREATE INDEX IF NOT EXISTS idx_integration_events_integration ON integration_events (integration_id, occurred_at DESC);
`);

const seedNow = new Date().toISOString();
db.prepare(`
  INSERT INTO products (code, name, description, status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(code) DO NOTHING
`).run(
  "PAYMENT_ACCOUNTING_SYNC",
  "Betalingsoppgjør til regnskapssystem",
  "Integrasjonsprodukt for automatisk overføring av betalingsoppgjør til regnskapssystem.",
  "Planlagt",
  seedNow,
  seedNow,
);
