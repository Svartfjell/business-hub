export type JsonObject = Record<string, unknown>;

export function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object"
    ? (value as JsonObject)
    : null;
}

export function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function text(value: unknown): string | null {
  if (typeof value === "string") {
    const result = value.trim();
    return result || null;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return null;
}

export function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

export function pathValue(source: unknown, ...keys: string[]): unknown {
  let current: unknown = source;
  for (const key of keys) {
    const currentObject = object(current);
    if (!currentObject) return undefined;
    current = currentObject[key];
  }
  return current;
}

export function normalizeIndustryCode(value: string): string {
  const match = value.match(/\d{2}[.,]\d{3}|\d{5}/);
  if (!match) {
    throw new Error("Næringskode må skrives som 47.710 eller fem sifre.");
  }

  const cleaned = match[0].replace(",", ".");
  if (/^\d{5}$/.test(cleaned)) {
    return `${cleaned.slice(0, 2)}.${cleaned.slice(2)}`;
  }

  return cleaned;
}

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
