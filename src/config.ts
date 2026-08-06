import path from "node:path";
import process from "node:process";

function integer(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

export const config = {
  port: integer(process.env.PORT, 3002),
  databasePath: path.resolve(
    process.cwd(),
    process.env.DATABASE_PATH ?? "./data/segment.sqlite",
  ),
  baseUrl:
    process.env.BRREG_BASE_URL ??
    "https://data.brreg.no/enhetsregisteret/api",
  delayMs: integer(process.env.BRREG_DELAY_MS, 175),
  batchSize: 25,
};
