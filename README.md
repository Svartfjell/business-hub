# Business Hub v6.0

Business Hub er CRM, segmentanalyse og kontrollsenter for kunder, oppgaver,
avtaler, produkter og integrasjonsstatus.

## Nytt i v6

- dashboard med pipeline, oppgaver, frister og aktivitet
- oppgaver både globalt og på kundekort
- produkt- og integrasjonsstatus på kundekort
- databasegrunnlag for produkter, kundeprodukter og integrasjonshendelser
- versjonert API for kundeportal og integrasjonstjenester
- GitHub-klar struktur uten lokal database i repositoryet

## API for andre prosjekter

- `GET /api/v1/products`
- `GET /api/v1/customers/:organisationNumber`
- `POST /api/v1/integration-orders`
- `PATCH /api/v1/integrations/:id/status`

Integrasjonsprosjektet skal bruke disse endepunktene og skal ikke skrive direkte
til SQLite-databasen.

## Oppstart

```powershell
npm install
npm run build
npm run dev
```

Åpne `http://localhost:3002`.

## Data og GitHub

`data/segment.sqlite`, WAL/SHM-filer, `.env`, eksporter, logger og
sikkerhetskopier er ignorert av Git. Ta alltid egen sikkerhetskopi av databasen.
