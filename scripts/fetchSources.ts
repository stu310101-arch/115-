import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

type SourceUrlModule = typeof import("../lib/sourceUrls");

// Node runs this TypeScript file directly, so the runtime import needs its .ts suffix.
const {
  CAC_115_COLLEGE_LIST_URL,
  CAC_115_EXPECTED_SCHOOL_COUNT,
  assertOfficialCac115SourceUrl,
  reportHtmlUrlForSchool,
  reportImageUrlForSchool,
  resolveOfficialCac115SourceUrl,
} = (await import(
  new URL("../lib/sourceUrls.ts", import.meta.url).href
)) as SourceUrlModule;

type SchoolLink = {
  schoolId: string;
  schoolName: string;
  reportHtmlUrl: string;
};

type SchoolSource115 = SchoolLink & {
  reportImageUrl: string;
  collegeListUrl: string;
};

type FetchedHtml = {
  html: string;
  charset: string;
};

const outputDirectoryUrl = new URL("../data/", import.meta.url);
const outputFileUrl = new URL("sources_115.json", outputDirectoryUrl);
const reportConcurrency = 5;
const maximumFetchAttempts = 4;
const requestTimeoutMs = 20_000;

const requestHeaders = {
  accept: "text/html,application/xhtml+xml",
  "accept-language": "zh-TW,zh;q=0.9,en;q=0.7",
  "user-agent":
    "Mozilla/5.0 (compatible; CAC-115-source-indexer/1.0; +https://www.cac.edu.tw/)",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithRetry(url: string): Promise<Response> {
  assertOfficialCac115SourceUrl(url);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maximumFetchAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: requestHeaders,
        redirect: "follow",
        signal: AbortSignal.timeout(requestTimeoutMs),
      });

      assertOfficialCac115SourceUrl(response.url);

      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt < maximumFetchAttempts) {
        await delay(300 * 2 ** (attempt - 1));
      }
    }
  }

  throw new Error(
    `Unable to fetch ${url} after ${maximumFetchAttempts} attempts: ${errorMessage(lastError)}`,
  );
}

function charsetFromContentType(contentType: string | null): string | undefined {
  return contentType?.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1];
}

function charsetFromHtmlBytes(bytes: Uint8Array): string | undefined {
  const asciiPreview = new TextDecoder("windows-1252").decode(
    bytes.subarray(0, 4096),
  );
  return asciiPreview.match(/charset\s*=\s*["']?([^;"'>\s]+)/i)?.[1];
}

function decodeHtmlBytes(
  bytes: Uint8Array,
  contentType: string | null,
): FetchedHtml {
  const charset =
    charsetFromContentType(contentType) ?? charsetFromHtmlBytes(bytes) ?? "utf-8";

  try {
    return {
      html: new TextDecoder(charset, { fatal: true }).decode(bytes),
      charset: charset.toUpperCase(),
    };
  } catch (error) {
    throw new Error(
      `Unable to decode official HTML as ${charset}: ${errorMessage(error)}`,
    );
  }
}

async function fetchHtml(url: string): Promise<FetchedHtml> {
  const response = await fetchWithRetry(url);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return decodeHtmlBytes(bytes, response.headers.get("content-type"));
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
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
      if (!body.startsWith("#")) {
        return namedEntities[body.toLowerCase()] ?? entity;
      }

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
      `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'<=\u0060>]+))`,
      "i",
    ),
  );
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value === undefined ? undefined : decodeHtmlEntities(value.trim());
}

function textContent(html: string): string {
  return decodeHtmlEntities(html.replace(/<!--[^]*?-->/g, " ").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function parseSchoolLinks(html: string): SchoolLink[] {
  const schools: SchoolLink[] = [];
  const seenIds = new Set<string>();
  const anchorPattern = /<a\b([^>]*)>([^]*?)<\/a\s*>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const href = attributeValue(match[1], "href");
    if (!href) continue;

    const reportHtmlUrl = resolveOfficialCac115SourceUrl(
      href,
      CAC_115_COLLEGE_LIST_URL,
    );
    const hrefId = new URL(reportHtmlUrl).pathname.match(
      /\/report\/(\d{3})\.htm$/i,
    )?.[1];
    if (!hrefId) continue;

    const label = textContent(match[2]);
    const labelMatch = label.match(/^\((\d{3})\)\s*(.+)$/);
    if (!labelMatch) {
      throw new Error(`Malformed school label for ${href}: ${label}`);
    }

    const [, labelId, schoolName] = labelMatch;
    if (hrefId !== labelId) {
      throw new Error(
        `School id mismatch: href uses ${hrefId}, label uses ${labelId}`,
      );
    }
    if (seenIds.has(hrefId)) {
      throw new Error(`Duplicate school id in collegeList.htm: ${hrefId}`);
    }

    const expectedReportUrl = reportHtmlUrlForSchool(hrefId);
    if (reportHtmlUrl !== expectedReportUrl) {
      throw new Error(
        `Unexpected report URL for ${hrefId}: ${reportHtmlUrl} (expected ${expectedReportUrl})`,
      );
    }

    seenIds.add(hrefId);
    schools.push({
      schoolId: hrefId,
      schoolName: schoolName.trim(),
      reportHtmlUrl,
    });
  }

  if (schools.length !== CAC_115_EXPECTED_SCHOOL_COUNT) {
    throw new Error(
      `Parsed ${schools.length} schools; expected ${CAC_115_EXPECTED_SCHOOL_COUNT}`,
    );
  }

  return schools.sort((left, right) =>
    left.schoolId.localeCompare(right.schoolId, "en"),
  );
}

function parseReportImageUrl(
  html: string,
  school: SchoolLink,
): string {
  const imageUrls: string[] = [];
  const imagePattern = /<img\b([^>]*)>/gi;

  for (const match of html.matchAll(imagePattern)) {
    const src = attributeValue(match[1], "src");
    if (!src) continue;

    const candidate = new URL(src, school.reportHtmlUrl);
    if (!/\/report\/pict\/\d{3}\.png$/i.test(candidate.pathname)) continue;

    const officialUrl = resolveOfficialCac115SourceUrl(
      src,
      school.reportHtmlUrl,
    );
    imageUrls.push(officialUrl);
  }

  const uniqueImageUrls = [...new Set(imageUrls)];
  if (uniqueImageUrls.length !== 1) {
    throw new Error(
      `${school.schoolId} report contains ${uniqueImageUrls.length} matching official images`,
    );
  }

  const reportImageUrl = uniqueImageUrls[0];
  const expectedImageUrl = reportImageUrlForSchool(school.schoolId);
  if (reportImageUrl !== expectedImageUrl) {
    throw new Error(
      `Unexpected image URL for ${school.schoolId}: ${reportImageUrl} (expected ${expectedImageUrl})`,
    );
  }

  return reportImageUrl;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(values[currentIndex]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      () => worker(),
    ),
  );
  return results;
}

async function main(): Promise<void> {
  const collegeList = await fetchHtml(CAC_115_COLLEGE_LIST_URL);
  const schoolLinks = parseSchoolLinks(collegeList.html);
  const reportCharsets = new Set<string>();

  const sources = await mapWithConcurrency(
    schoolLinks,
    reportConcurrency,
    async (school): Promise<SchoolSource115> => {
      try {
        const report = await fetchHtml(school.reportHtmlUrl);
        reportCharsets.add(report.charset);
        return {
          ...school,
          reportImageUrl: parseReportImageUrl(report.html, school),
          collegeListUrl: CAC_115_COLLEGE_LIST_URL,
        };
      } catch (error) {
        throw new Error(
          `Failed to index ${school.schoolId} ${school.schoolName}: ${errorMessage(error)}`,
        );
      }
    },
  );

  await mkdir(outputDirectoryUrl, { recursive: true });
  await writeFile(outputFileUrl, `${JSON.stringify(sources, null, 2)}\n`, "utf8");

  console.log(`Indexed ${sources.length} official school sources.`);
  console.log(`collegeList.htm charset: ${collegeList.charset}`);
  console.log(
    `Report HTML charset(s): ${[...reportCharsets].sort().join(", ")}`,
  );
  console.log(`Wrote ${fileURLToPath(outputFileUrl)}`);
}

main().catch((error: unknown) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
