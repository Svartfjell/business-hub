import { config } from "./config.js";
import {
  array,
  errorText,
  object,
  pathValue,
  sleep,
  text,
  type JsonObject,
} from "./util.js";

type Filters = {
  fromRegistrationDate?: string;
  toRegistrationDate?: string;
};

type PageResult = {
  entities: JsonObject[];
  totalPages: number;
  totalElements: number;
};

const PAGE_SIZE = 100;
const MAX_RESULTS = 10_000;

async function json(url: URL): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "brreg-segmentanalyse/4.1",
        },
      });

      if (response.ok) return await response.json();

      const body = await response.text();
      throw new Error(`Brreg ${response.status}: ${body.slice(0, 500)}`);
    } catch (error) {
      lastError = error;
      if (attempt < 4) await sleep(attempt * attempt * 750);
    }
  }

  throw new Error(errorText(lastError));
}

function buildUrl(
  industryCode: string,
  page: number,
  size: number,
  filters: Filters = {},
): URL {
  const url = new URL(`${config.baseUrl}/enheter`);
  url.searchParams.set("naeringskode", industryCode);
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(size));
  url.searchParams.set("sort", "organisasjonsnummer,ASC");

  if (filters.fromRegistrationDate) {
    url.searchParams.set(
      "fraRegistreringsdatoEnhetsregisteret",
      filters.fromRegistrationDate,
    );
  }

  if (filters.toRegistrationDate) {
    url.searchParams.set(
      "tilRegistreringsdatoEnhetsregisteret",
      filters.toRegistrationDate,
    );
  }

  return url;
}

async function entityPage(
  industryCode: string,
  page: number,
  size = PAGE_SIZE,
  filters: Filters = {},
): Promise<PageResult> {
  const data = object(await json(buildUrl(industryCode, page, size, filters)));
  const embedded = object(data?._embedded);
  const entities = array(embedded?.enheter)
    .map(object)
    .filter((item): item is JsonObject => Boolean(item));
  const pageInfo = object(data?.page);

  return {
    entities,
    totalPages: Number(pageInfo?.totalPages ?? 1) || 1,
    totalElements: Number(pageInfo?.totalElements ?? entities.length) || 0,
  };
}

function dateText(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function midpoint(start: Date, end: Date): Date {
  const middle = new Date(
    start.getTime() + Math.floor((end.getTime() - start.getTime()) / 2),
  );
  return new Date(
    Date.UTC(
      middle.getUTCFullYear(),
      middle.getUTCMonth(),
      middle.getUTCDate(),
    ),
  );
}

function addEntities(
  entities: JsonObject[],
  industryCode: string,
  organisationNumbers: Set<string>,
  description: { value: string },
): void {
  for (const item of entities) {
    const orgnr = text(item.organisasjonsnummer);
    if (orgnr) organisationNumbers.add(orgnr);

    const code = text(pathValue(item, "naeringskode1", "kode"));
    const label = text(pathValue(item, "naeringskode1", "beskrivelse"));
    if (code === industryCode && label) description.value = label;
  }
}

async function fetchWholeQuery(
  industryCode: string,
  filters: Filters,
  organisationNumbers: Set<string>,
  description: { value: string },
  label: string,
): Promise<void> {
  const first = await entityPage(industryCode, 0, PAGE_SIZE, filters);
  addEntities(first.entities, industryCode, organisationNumbers, description);

  for (let page = 1; page < first.totalPages; page += 1) {
    await sleep(config.delayMs);
    const result = await entityPage(industryCode, page, PAGE_SIZE, filters);
    addEntities(result.entities, industryCode, organisationNumbers, description);
    process.stdout.write(
      `\r${label}: side ${page + 1}/${first.totalPages} – ${organisationNumbers.size.toLocaleString("nb-NO")} unike`,
    );
  }

  process.stdout.write("\n");
}

async function fetchDateRange(
  industryCode: string,
  start: Date,
  end: Date,
  organisationNumbers: Set<string>,
  description: { value: string },
): Promise<void> {
  const fromDate = dateText(start);
  const toDate = dateText(end);
  const filters: Filters = {
    fromRegistrationDate: fromDate,
    toRegistrationDate: toDate,
  };

  const preview = await entityPage(industryCode, 0, 1, filters);
  if (preview.totalElements === 0) return;

  if (preview.totalElements <= MAX_RESULTS) {
    await fetchWholeQuery(
      industryCode,
      filters,
      organisationNumbers,
      description,
      `${fromDate}–${toDate}`,
    );
    return;
  }

  if (fromDate === toDate) {
    throw new Error(`Mer enn 10 000 treff på én dato: ${fromDate}`);
  }

  const middle = midpoint(start, end);
  const rightStart = addDays(middle, 1);

  await fetchDateRange(
    industryCode,
    start,
    middle,
    organisationNumbers,
    description,
  );

  if (rightStart <= end) {
    await fetchDateRange(
      industryCode,
      rightStart,
      end,
      organisationNumbers,
      description,
    );
  }
}

export async function allOrganisationNumbers(
  industryCode: string,
): Promise<{ organisationNumbers: string[]; description: string }> {
  const first = await entityPage(industryCode, 0);
  const organisationNumbers = new Set<string>();
  const description = { value: industryCode };

  if (first.totalElements <= MAX_RESULTS) {
    addEntities(first.entities, industryCode, organisationNumbers, description);

    for (let page = 1; page < first.totalPages; page += 1) {
      await sleep(config.delayMs);
      const result = await entityPage(industryCode, page);
      addEntities(result.entities, industryCode, organisationNumbers, description);
      process.stdout.write(`\rSøkeside ${page + 1}/${first.totalPages}`);
    }
    process.stdout.write("\n");
  } else {
    await fetchDateRange(
      industryCode,
      new Date(Date.UTC(1800, 0, 1)),
      new Date(),
      organisationNumbers,
      description,
    );
  }

  return {
    organisationNumbers: [...organisationNumbers].sort(),
    description: description.value,
  };
}

export async function entity(
  organisationNumber: string,
): Promise<JsonObject> {
  const result = object(
    await json(new URL(`${config.baseUrl}/enheter/${organisationNumber}`)),
  );
  if (!result) throw new Error("Ugyldig enhetsrespons.");
  return result;
}

export async function roles(
  organisationNumber: string,
): Promise<JsonObject> {
  return (
    object(
      await json(
        new URL(`${config.baseUrl}/enheter/${organisationNumber}/roller`),
      ),
    ) ?? { rollegrupper: [] }
  );
}

export function accountingFirm(
  roleData: JsonObject,
): { name: string; organisationNumber: string | null } | null {
  for (const groupValue of array(roleData.rollegrupper)) {
    const group = object(groupValue);
    if (!group) continue;
    if (text(pathValue(group, "type", "kode")) !== "REGN") continue;

    for (const roleValue of array(group.roller)) {
      const role = object(roleValue);
      if (!role) continue;
      const legalEntity = object(role.enhet);
      if (!legalEntity) continue;

      const rawName = legalEntity.navn;
      const name = Array.isArray(rawName)
        ? rawName
            .map(text)
            .filter((item): item is string => Boolean(item))
            .join(" ")
        : text(rawName);

      if (name) {
        return {
          name,
          organisationNumber: text(legalEntity.organisasjonsnummer),
        };
      }
    }
  }

  return null;
}
