import https from "node:https";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

type Source115 = {
  schoolId: string;
};

type OfficialSchool = {
  schoolId: string;
  schoolName: string;
  declaredProgramCount: number;
  listUrl: string;
};

type FirstStageItem = {
  label: string;
  standard: string;
  multiplier: string;
};

type Program = {
  schoolId: string;
  schoolName: string;
  programCode: string;
  programName: string;
  quota: number | null;
  detailUrl: string;
  items: FirstStageItem[];
  source: {
    listUrl: string;
    detailUrl: string;
  };
  raw: {
    quota: string;
    listRowHtml: string;
    firstStage: {
      labels: string[];
      standards: string[];
      multipliers: string[];
      labelsHtml: string;
      standardsHtml: string;
      multipliersHtml: string;
    };
    detailCachePath: string;
    /** Parsed from the official detail page's APCS screening section. */
    requiresApcs: boolean;
  };
};

type SchoolCatalog = OfficialSchool & {
  actualProgramCount: number;
  programs: Program[];
};

type ListedProgram = {
  schoolId: string;
  schoolName: string;
  programCode: string;
  programName: string;
  quota: number | null;
  quotaRaw: string;
  detailUrl: string;
  listRowHtml: string;
};

type Catalog = {
  academicYear: 115;
  sourceUrl: string;
  fetchedAt: string;
  declaredSchoolCount: number;
  declaredProgramCount: number;
  schools: SchoolCatalog[];
  programs: Program[];
  validation: {
    inputSchoolCount: number;
    actualSchoolCount: number;
    actualProgramCount: number;
    uniqueProgramCodeCount: number;
    schoolCountsMatch: boolean;
    totalCountMatches: boolean;
    programCodesUnique: boolean;
  };
};

type HttpResult = {
  body: Buffer;
  headers: Record<string, string | string[] | undefined>;
  statusCode: number;
  url: string;
};

const officialOrigin = "https://www.cac.edu.tw";
const queryBaseUrl =
  `${officialOrigin}/apply115/system/ColQry_115xappLyfOrStu_Azd5gP29/`;
const totalUrl = new URL("TotalGsdShow.htm", queryBaseUrl).href;
const expectedSchoolCount = 64;
const expectedProgramCount = 2206;

const sourceFileUrl = new URL("../data/sources_115.json", import.meta.url);
const workDirectoryUrl = new URL("../work/official-115/", import.meta.url);
const schoolCacheDirectoryUrl = new URL("schools/", workDirectoryUrl);
const detailCacheDirectoryUrl = new URL("details/", workDirectoryUrl);
const totalCacheUrl = new URL("TotalGsdShow.htm", workDirectoryUrl);
const outputFileUrl = new URL("catalog.json", workDirectoryUrl);

const requestTimeoutMs = Number(process.env.CATALOG_TIMEOUT_MS ?? 20_000);
const maximumFetchAttempts = Number(process.env.CATALOG_RETRIES ?? 5);
const detailConcurrency = Number(process.env.CATALOG_CONCURRENCY ?? 4);
const minimumRequestIntervalMs = Number(
  process.env.CATALOG_REQUEST_INTERVAL_MS ?? 100,
);
const forceRefresh = process.argv.includes("--refresh");

const requestHeaders = {
  accept: "text/html,application/xhtml+xml",
  "accept-language": "zh-TW,zh;q=0.9,en;q=0.7",
  "user-agent":
    "Mozilla/5.0 (compatible; CAC-115-official-catalog/1.0; +https://www.cac.edu.tw/)",
};

let sessionCookie = "";
let nextRequestAt = 0;
let completedDetails = 0;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assertOfficialUrl(value: string): void {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "www.cac.edu.tw" ||
    !url.pathname.startsWith(
      "/apply115/system/ColQry_115xappLyfOrStu_Azd5gP29/",
    )
  ) {
    throw new Error(`Refusing non-official or out-of-scope URL: ${value}`);
  }
}

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextRequestAt - now);
  nextRequestAt = Math.max(now, nextRequestAt) + minimumRequestIntervalMs;
  if (wait > 0) await delay(wait);
}

function httpGet(
  url: string,
  referer: string,
  redirectCount = 0,
): Promise<HttpResult> {
  assertOfficialUrl(url);

  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { ...requestHeaders, referer };
    if (sessionCookie) headers.cookie = sessionCookie;

    const request = https.get(url, { headers }, (response) => {
      const statusCode = response.statusCode ?? 0;
      const location = response.headers.location;
      if (statusCode >= 300 && statusCode < 400 && location) {
        response.resume();
        if (redirectCount >= 5) {
          reject(new Error(`Too many redirects while fetching ${url}`));
          return;
        }
        const redirectUrl = new URL(location, url).href;
        httpGet(redirectUrl, referer, redirectCount + 1).then(resolve, reject);
        return;
      }

      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          body: Buffer.concat(chunks),
          headers: response.headers,
          statusCode,
          url,
        });
      });
    });

    request.setTimeout(requestTimeoutMs, () => {
      request.destroy(new Error(`Request timed out after ${requestTimeoutMs}ms`));
    });
    request.on("error", reject);
  });
}

function cookiesFromSetCookie(
  setCookie: string | string[] | undefined,
): string {
  const values = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  return values
    .map((value) => value.split(";", 1)[0]?.trim())
    .filter((value): value is string => Boolean(value))
    .join("; ");
}

function decodeResponse(result: HttpResult): string {
  // All pages in this official 115 query system declare and use UTF-8.
  return new TextDecoder("utf-8", { fatal: true }).decode(result.body);
}

async function fetchHtml(url: string, referer: string): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maximumFetchAttempts; attempt += 1) {
    try {
      await waitForRateLimit();
      const result = await httpGet(url, referer);
      if (result.statusCode !== 200) {
        throw new Error(`HTTP ${result.statusCode}`);
      }
      const html = decodeResponse(result);
      if (!/<html\b/i.test(html)) {
        throw new Error(`Response is not HTML (${result.body.length} bytes)`);
      }
      return html;
    } catch (error) {
      lastError = error;
      if (attempt < maximumFetchAttempts) {
        await delay(400 * 2 ** (attempt - 1));
      }
    }
  }

  throw new Error(
    `Unable to fetch ${url} after ${maximumFetchAttempts} attempts: ${errorMessage(lastError)}`,
  );
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(
    /&(#(?:x[0-9a-f]+|\d+)|amp|apos|gt|lt|nbsp|quot);/gi,
    (entity, body: string) => {
      if (!body.startsWith("#")) return named[body.toLowerCase()] ?? entity;
      const hexadecimal = body[1]?.toLowerCase() === "x";
      const digits = body.slice(hexadecimal ? 2 : 1);
      const codePoint = Number.parseInt(digits, hexadecimal ? 16 : 10);
      return Number.isInteger(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    },
  );
}

function attributeValue(attributes: string, name: string): string | undefined {
  const match = attributes.match(
    new RegExp(
      // The official legacy HTML leaves URLs unquoted even though their query
      // strings contain "=". Accept that real-world markup here.
      `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'<\u0060>]+))`,
      "i",
    ),
  );
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value === undefined ? undefined : decodeHtmlEntities(value.trim());
}

function textContent(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<!--[^]*?-->/g, " ")
      .replace(/<[^>]*>/g, " ")
      // The official legacy pages contain the non-standard spelling
      // "&nbsp" without a terminating semicolon.
      .replace(/&nbsp;?/gi, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function htmlLines(html: string): string[] {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .split("\n")
    .map((line) => textContent(line))
    .filter(Boolean);
}

function tableCells(rowHtml: string): Array<{
  attributes: string;
  html: string;
  text: string;
}> {
  return [...rowHtml.matchAll(/<td\b([^>]*)>([^]*?)<\/td\s*>/gi)].map(
    (match) => ({
      attributes: match[1],
      html: match[2],
      text: textContent(match[2]),
    }),
  );
}

function parseTotalPage(html: string): {
  declaredSchoolCount: number;
  declaredProgramCount: number;
  schools: OfficialSchool[];
} {
  const declaredSchoolCount = Number(
    html.match(/共計\s*(\d+)\s*所學校/)?.[1],
  );
  const declaredProgramCount = Number(
    html.match(/總校系數\s*(\d+)\s*系/)?.[1],
  );
  if (!declaredSchoolCount || !declaredProgramCount) {
    throw new Error("Unable to parse official totals from TotalGsdShow.htm");
  }

  const schools: OfficialSchool[] = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([^]*?)<\/a\s*>/gi)) {
    const href = attributeValue(match[1], "href");
    if (!href || !/ShowSchGsd\.php/i.test(href)) continue;
    const label = textContent(match[2]);
    const labelMatch = label.match(/^\((\d{3})\)\s*(.*?)\s*-\s*(\d+)\s*系/);
    if (!labelMatch) throw new Error(`Malformed school link label: ${label}`);
    const listUrl = new URL(href, totalUrl).href;
    assertOfficialUrl(listUrl);
    schools.push({
      schoolId: labelMatch[1],
      schoolName: labelMatch[2].trim(),
      declaredProgramCount: Number(labelMatch[3]),
      listUrl,
    });
  }

  const uniqueIds = new Set(schools.map((school) => school.schoolId));
  if (uniqueIds.size !== schools.length) {
    throw new Error("TotalGsdShow.htm contains duplicate school ids");
  }
  if (schools.length !== declaredSchoolCount) {
    throw new Error(
      `Parsed ${schools.length} schools, official page declares ${declaredSchoolCount}`,
    );
  }

  return { declaredSchoolCount, declaredProgramCount, schools };
}

function findTitledCell(
  cells: ReturnType<typeof tableCells>,
  title: string,
): ReturnType<typeof tableCells>[number] | undefined {
  return cells.find(
    (cell) => attributeValue(cell.attributes, "title") === title,
  );
}

function parseSchoolPage(html: string, school: OfficialSchool): ListedProgram[] {
  const headerMatch = textContent(html).match(
    /查詢學校名稱\s*:\s*(.*?)\s*\((\d{3})\)\s*共\s*(\d+)\s*系/,
  );
  if (!headerMatch) {
    throw new Error(`Unable to parse school header for ${school.schoolId}`);
  }
  if (headerMatch[2] !== school.schoolId) {
    throw new Error(
      `School header mismatch for ${school.schoolId}: ${headerMatch[1]} (${headerMatch[2]})`,
    );
  }
  // School 152 was renamed after the total-page label was published.  The
  // school page and every program row consistently carry the current official
  // name, so use that more specific page as the canonical catalog value.
  school.schoolName = headerMatch[1];
  const pageDeclaredCount = Number(headerMatch[3]);
  if (pageDeclaredCount !== school.declaredProgramCount) {
    throw new Error(
      `${school.schoolId} total page says ${school.declaredProgramCount}, school page says ${pageDeclaredCount}`,
    );
  }

  const programs: ListedProgram[] = [];
  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([^]*?)<\/tr\s*>/gi)) {
    const rowHtml = rowMatch[0];
    const cells = tableCells(rowHtml);
    const nameCell = findTitledCell(cells, "校系名稱及代碼");
    if (!nameCell) continue;

    const code = nameCell.text.match(/\((\d{6})\)\s*$/)?.[1];
    const hrefCell = cells.find((cell) => /115_\d{6}\.htm/i.test(cell.html));
    const hrefMatch = hrefCell?.html.match(/<a\b([^>]*)>/i);
    const href = hrefMatch ? attributeValue(hrefMatch[1], "href") : undefined;
    const quotaRaw = findTitledCell(cells, "招生名額")?.text ?? "";
    if (!code || !href || !quotaRaw) {
      throw new Error(`Malformed program row in school ${school.schoolId}`);
    }

    const namePieces = nameCell.html.split(/<br\s*\/?>/i);
    if (namePieces.length < 2) {
      throw new Error(`Missing school/program name separator for ${code}`);
    }
    const rowSchoolName = textContent(namePieces[0]);
    const programName = textContent(
      namePieces.slice(1).join(" ").replace(/<font\b[^]*$/i, ""),
    );
    if (rowSchoolName !== school.schoolName || !programName) {
      throw new Error(
        `Malformed school/program name for ${code}: ${rowSchoolName} / ${programName}`,
      );
    }

    const detailUrl = new URL(href, school.listUrl).href;
    assertOfficialUrl(detailUrl);
    if (!new URL(detailUrl).pathname.endsWith(`/115_${code}.htm`)) {
      throw new Error(`Program code/detail URL mismatch for ${code}: ${detailUrl}`);
    }
    const quota = /^\d+$/.test(quotaRaw) ? Number(quotaRaw) : null;
    programs.push({
      schoolId: school.schoolId,
      schoolName: school.schoolName,
      programCode: code,
      programName,
      quota,
      quotaRaw,
      detailUrl,
      listRowHtml: rowHtml,
    });
  }

  if (programs.length !== school.declaredProgramCount) {
    throw new Error(
      `${school.schoolId} parsed ${programs.length} programs; official page declares ${school.declaredProgramCount}`,
    );
  }
  return programs;
}

function parseFirstStage(
  html: string,
  programCode: string,
): {
  items: FirstStageItem[];
  raw: Program["raw"]["firstStage"];
} {
  const row = [...html.matchAll(/<tr\b[^>]*>([^]*?)<\/tr\s*>/gi)].find(
    (match) => textContent(match[0]).includes(`校系代碼 ${programCode}`),
  );
  if (!row) throw new Error(`Unable to find first-stage row for ${programCode}`);
  const cells = tableCells(row[0]);
  const codeIndex = cells.findIndex((cell) => cell.text === programCode);
  if (codeIndex < 1 || cells[codeIndex - 1]?.text !== "校系代碼") {
    throw new Error(`Malformed program-code cells for ${programCode}`);
  }
  const labelsCell = cells[codeIndex + 1];
  const standardsCell = cells[codeIndex + 2];
  const multipliersCell = cells[codeIndex + 3];
  if (!labelsCell || !standardsCell || !multipliersCell) {
    throw new Error(`Missing first-stage cells for ${programCode}`);
  }

  const labels = htmlLines(labelsCell.html);
  const standards = htmlLines(standardsCell.html);
  const multipliers = htmlLines(multipliersCell.html);
  if (
    labels.length === 0 ||
    labels.length !== standards.length ||
    labels.length !== multipliers.length
  ) {
    throw new Error(
      `${programCode} first-stage columns have different lengths: ` +
        `labels=${JSON.stringify(labels)}, standards=${JSON.stringify(standards)}, ` +
        `multipliers=${JSON.stringify(multipliers)}`,
    );
  }

  const items = labels.map((label, index) => ({
    label,
    standard: standards[index],
    multiplier: multipliers[index],
  }));
  return {
    items,
    raw: {
      labels,
      standards,
      multipliers,
      labelsHtml: labelsCell.html,
      standardsHtml: standardsCell.html,
      multipliersHtml: multipliersCell.html,
    },
  };
}

async function readValidCache(
  cacheUrl: URL,
  validator: (html: string) => boolean,
): Promise<string | undefined> {
  if (forceRefresh) return undefined;
  try {
    const html = await readFile(cacheUrl, "utf8");
    return validator(html) ? html : undefined;
  } catch {
    return undefined;
  }
}

async function cachedHtml(
  cacheUrl: URL,
  url: string,
  referer: string,
  validator: (html: string) => boolean,
): Promise<string> {
  const cached = await readValidCache(cacheUrl, validator);
  if (cached !== undefined) return cached;
  const html = await fetchHtml(url, referer);
  if (!validator(html)) {
    throw new Error(`Fetched HTML failed validation: ${url}`);
  }
  await writeFile(cacheUrl, html, "utf8");
  return html;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error(`CATALOG_CONCURRENCY must be an integer from 1 to 8`);
  }
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}

async function bootstrapSession(): Promise<string> {
  await waitForRateLimit();
  const result = await httpGet(totalUrl, officialOrigin);
  if (result.statusCode !== 200) {
    throw new Error(`Unable to bootstrap official session: HTTP ${result.statusCode}`);
  }
  sessionCookie = cookiesFromSetCookie(result.headers["set-cookie"]);
  const html = decodeResponse(result);
  if (!/<html\b/i.test(html)) throw new Error("Official total page is not HTML");
  await writeFile(totalCacheUrl, html, "utf8");
  return html;
}

async function writeCatalogAtomically(catalog: Catalog): Promise<void> {
  const temporaryUrl = new URL("catalog.json.tmp", workDirectoryUrl);
  await writeFile(temporaryUrl, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  await rename(temporaryUrl, outputFileUrl);
}

async function main(): Promise<void> {
  await mkdir(schoolCacheDirectoryUrl, { recursive: true });
  await mkdir(detailCacheDirectoryUrl, { recursive: true });

  const sources = JSON.parse(await readFile(sourceFileUrl, "utf8")) as Source115[];
  const inputIds = sources.map((source) => source.schoolId);
  if (new Set(inputIds).size !== inputIds.length) {
    throw new Error("data/sources_115.json contains duplicate school ids");
  }

  const totalHtml = await bootstrapSession();
  const official = parseTotalPage(totalHtml);
  if (
    official.declaredSchoolCount !== expectedSchoolCount ||
    official.declaredProgramCount !== expectedProgramCount
  ) {
    throw new Error(
      `Official totals changed: ${official.declaredSchoolCount} schools / ` +
        `${official.declaredProgramCount} programs (expected 64 / 2206)`,
    );
  }
  const officialIds = official.schools.map((school) => school.schoolId);
  const missingInInput = officialIds.filter((id) => !inputIds.includes(id));
  const extraInInput = inputIds.filter((id) => !officialIds.includes(id));
  if (missingInInput.length > 0 || extraInInput.length > 0) {
    throw new Error(
      `data/sources_115.json school ids differ from official total page; ` +
        `missing=${missingInInput.join(",") || "none"}, ` +
        `extra=${extraInInput.join(",") || "none"}`,
    );
  }

  const listedPrograms: ListedProgram[] = [];
  for (const [index, school] of official.schools.entries()) {
    const cacheUrl = new URL(`${school.schoolId}.html`, schoolCacheDirectoryUrl);
    const html = await cachedHtml(
      cacheUrl,
      school.listUrl,
      totalUrl,
      (candidate) =>
        candidate.includes(`(${school.schoolId})`) &&
        candidate.includes("校系名稱及代碼"),
    );
    const programs = parseSchoolPage(html, school);
    listedPrograms.push(...programs);
    console.log(
      `[schools ${index + 1}/${official.schools.length}] ${school.schoolId} ` +
        `${school.schoolName}: ${programs.length}`,
    );
  }

  const listedCodes = new Set(listedPrograms.map((program) => program.programCode));
  if (listedPrograms.length !== expectedProgramCount || listedCodes.size !== expectedProgramCount) {
    throw new Error(
      `List validation failed: programs=${listedPrograms.length}, unique=${listedCodes.size}`,
    );
  }

  const programs = await mapWithConcurrency(
    listedPrograms,
    detailConcurrency,
    async (program): Promise<Program> => {
      const cacheUrl = new URL(`${program.programCode}.html`, detailCacheDirectoryUrl);
      const detailHtml = await cachedHtml(
        cacheUrl,
        program.detailUrl,
        new URL(
          `ShowSchGsd.php?colno=${program.schoolId}`,
          queryBaseUrl,
        ).href,
        (candidate) =>
          candidate.includes("校系代碼") && candidate.includes(program.programCode),
      );
      const firstStage = parseFirstStage(detailHtml, program.programCode);
      const requiresApcs = /須參加\s*APCS\s*檢測/iu.test(
        textContent(detailHtml),
      );
      completedDetails += 1;
      if (completedDetails % 25 === 0 || completedDetails === listedPrograms.length) {
        console.log(`[details ${completedDetails}/${listedPrograms.length}]`);
      }
      const detailCachePath = `details/${program.programCode}.html`;
      const listUrl = official.schools.find(
        (school) => school.schoolId === program.schoolId,
      )?.listUrl;
      if (!listUrl) throw new Error(`Missing list URL for ${program.programCode}`);
      return {
        schoolId: program.schoolId,
        schoolName: program.schoolName,
        programCode: program.programCode,
        programName: program.programName,
        quota: program.quota,
        detailUrl: program.detailUrl,
        items: firstStage.items,
        source: { listUrl, detailUrl: program.detailUrl },
        raw: {
          quota: program.quotaRaw,
          listRowHtml: program.listRowHtml,
          firstStage: firstStage.raw,
          detailCachePath,
          requiresApcs,
        },
      };
    },
  );

  const programsBySchool = new Map<string, Program[]>();
  for (const program of programs) {
    const group = programsBySchool.get(program.schoolId) ?? [];
    group.push(program);
    programsBySchool.set(program.schoolId, group);
  }
  const schools: SchoolCatalog[] = official.schools.map((school) => {
    const schoolPrograms = programsBySchool.get(school.schoolId) ?? [];
    return {
      ...school,
      actualProgramCount: schoolPrograms.length,
      programs: schoolPrograms,
    };
  });
  const uniqueProgramCodeCount = new Set(
    programs.map((program) => program.programCode),
  ).size;
  const schoolCountsMatch = schools.every(
    (school) => school.actualProgramCount === school.declaredProgramCount,
  );
  const totalCountMatches = programs.length === official.declaredProgramCount;
  const programCodesUnique = uniqueProgramCodeCount === programs.length;
  if (!schoolCountsMatch || !totalCountMatches || !programCodesUnique) {
    throw new Error(
      `Final validation failed: schoolCounts=${schoolCountsMatch}, ` +
        `total=${programs.length}/${official.declaredProgramCount}, ` +
        `unique=${uniqueProgramCodeCount}/${programs.length}`,
    );
  }

  const catalog: Catalog = {
    academicYear: 115,
    sourceUrl: totalUrl,
    fetchedAt: new Date().toISOString(),
    declaredSchoolCount: official.declaredSchoolCount,
    declaredProgramCount: official.declaredProgramCount,
    schools,
    programs,
    validation: {
      inputSchoolCount: inputIds.length,
      actualSchoolCount: schools.length,
      actualProgramCount: programs.length,
      uniqueProgramCodeCount,
      schoolCountsMatch,
      totalCountMatches,
      programCodesUnique,
    },
  };
  await writeCatalogAtomically(catalog);
  console.log(
    `Validated ${schools.length} schools and ${programs.length} unique programs.`,
  );
  console.log(`Wrote ${fileURLToPath(outputFileUrl)}`);
}

main().catch((error: unknown) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
