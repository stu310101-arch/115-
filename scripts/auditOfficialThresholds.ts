import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { deriveRuleSubjects } from "./buildProgramsFromOfficial.ts";
import type { Program, Subject } from "../lib/types.ts";

type CatalogItem = {
  label: string;
  standard: string;
  multiplier: string;
};

type CatalogProgram = {
  schoolId: string;
  schoolName: string;
  programCode: string;
  programName: string;
  items: CatalogItem[];
};

type Catalog = { programs: CatalogProgram[] };

type BoundingBox = { x: number; y: number; width: number; height: number };
type OcrWord = { text: string; boundingBox: BoundingBox };
type OcrLine = { index?: number; text?: string; words?: OcrWord[] };
type OcrDocument = {
  status: string;
  image?: { width: number; height: number };
  lines?: OcrLine[];
};

type OcrIndex = {
  wordByCode: Map<string, OcrWord>;
  words: OcrWord[];
  width: number;
};

type ImageGeometry = {
  pixels: Buffer;
  width: number;
  height: number;
  horizontalLines: number[];
};

type CropCell = {
  programCode: string;
  schoolId: string;
  schoolName: string;
  programName: string;
  order: number;
  subjects: Subject[];
  expectedScore: number;
  imagePath: string;
  tailImagePath: string;
  sourceImagePath: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

type CellManifest = {
  schemaVersion: number;
  generatedAt: string;
  source: string;
  cells: CropCell[];
  structuralIssues: Array<Record<string, unknown>>;
};

type CellOcr = {
  programCode: string;
  order: number;
  status: string;
  text?: string;
  lines?: OcrLine[];
};

const root = new URL("../", import.meta.url);
const catalogUrl = new URL("work/official-114/catalog.json", root);
const programsUrl = new URL("data/programs_114.json", root);
const auditRoot = new URL("work/official-114-audit/", root);
const imageRoot = new URL("images/", auditRoot);
const ocrRoot = new URL("ocr/", auditRoot);
const cellRoot = new URL("threshold-cells/", auditRoot);
const manifestUrl = new URL("manifest.json", cellRoot);
const cellOcrUrl = new URL("threshold-cell-ocr.json", auditRoot);
const reportUrl = new URL("threshold-audit-report.json", auditRoot);
const pixelReportUrl = new URL("threshold-pixel-audit-report.json", auditRoot);

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\s\u3000]/gu, "")
    .replace(/[‐‑‒–—―−]/gu, "-");
}

function createOcrIndex(document: OcrDocument): OcrIndex | null {
  if (
    document.status !== "success" ||
    !document.image ||
    !Array.isArray(document.lines) ||
    document.image.width <= 0
  ) {
    return null;
  }
  const words = document.lines.flatMap((line) => line.words ?? []).filter(
    (word) =>
      typeof word.text === "string" &&
      word.boundingBox &&
      Object.values(word.boundingBox).every(
        (value) => typeof value === "number" && Number.isFinite(value),
      ),
  );
  const wordByCode = new Map<string, OcrWord>();
  for (const word of words) {
    const text = normalize(word.text);
    const centerX = word.boundingBox.x + word.boundingBox.width / 2;
    if (/^\d{6}$/.test(text) && centerX < document.image.width * 0.1) {
      wordByCode.set(text, word);
    }
  }
  return { wordByCode, words, width: document.image.width };
}

function inferMissingCodeRows(
  programs: readonly CatalogProgram[],
  index: OcrIndex | null,
): void {
  if (!index) return;
  for (let position = 1; position < programs.length - 1; position += 1) {
    const program = programs[position]!;
    if (index.wordByCode.has(program.programCode)) continue;
    const previous = index.wordByCode.get(programs[position - 1]!.programCode);
    const next = index.wordByCode.get(programs[position + 1]!.programCode);
    if (!previous || !next) continue;
    const previousCenter = previous.boundingBox.y + previous.boundingBox.height / 2;
    const nextCenter = next.boundingBox.y + next.boundingBox.height / 2;
    if (nextCenter - previousCenter < 16 || nextCenter - previousCenter > 100) {
      continue;
    }
    index.wordByCode.set(program.programCode, {
      text: program.programCode,
      boundingBox: {
        x: (previous.boundingBox.x + next.boundingBox.x) / 2,
        y:
          (previousCenter + nextCenter) / 2 -
          (previous.boundingBox.height + next.boundingBox.height) / 4,
        width: (previous.boundingBox.width + next.boundingBox.width) / 2,
        height: (previous.boundingBox.height + next.boundingBox.height) / 2,
      },
    });
  }
}

async function readImageGeometry(schoolId: string): Promise<ImageGeometry | null> {
  try {
    const { data, info } = await sharp(
      fileURLToPath(new URL(`${schoolId}.png`, imageRoot)),
    )
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels !== 1 || info.width <= 0 || info.height <= 0) return null;
    const darkRowThreshold = Math.min(1950, Math.floor(info.width * 0.68));
    const darkRows: number[] = [];
    for (let y = 0; y < info.height; y += 1) {
      let dark = 0;
      for (let x = 0; x < info.width; x += 1) {
        if ((data[y * info.width + x] ?? 255) < 80) dark += 1;
      }
      if (dark >= darkRowThreshold) darkRows.push(y);
    }
    const rowGroups: number[][] = [];
    for (const y of darkRows) {
      const last = rowGroups.at(-1);
      if (!last || y > (last.at(-1) ?? y) + 1) rowGroups.push([y]);
      else last.push(y);
    }
    return {
      pixels: data,
      width: info.width,
      height: info.height,
      horizontalLines: rowGroups.map(
        (group) => group[Math.floor(group.length / 2)]!,
      ),
    };
  } catch {
    return null;
  }
}

type VerticalLine = { left: number; right: number };

function tableRowBounds(
  centerY: number,
  geometry: ImageGeometry | null,
): { top: number; bottom: number } | null {
  if (!geometry) return null;
  const top = [...geometry.horizontalLines]
    .reverse()
    .find((line) => line < centerY - 2);
  const bottom = geometry.horizontalLines.find((line) => line > centerY + 2);
  if (top === undefined || bottom === undefined || bottom - top > 90) return null;
  return { top, bottom };
}

function screeningColumns(
  centerY: number,
  geometry: ImageGeometry | null,
): Array<{ left: number; right: number }> | null {
  if (!geometry) return null;
  const row = tableRowBounds(centerY, geometry);
  if (!row) return null;
  const top = Math.max(0, row.top + 3);
  const bottom = Math.min(geometry.height - 1, row.bottom - 3);
  const bandHeight = bottom - top + 1;
  if (bandHeight < 8) return null;
  const darkRequired = Math.max(7, Math.ceil(bandHeight * 0.9));
  const darkColumns: number[] = [];
  for (let x = 0; x < geometry.width; x += 1) {
    let dark = 0;
    for (let y = top; y <= bottom; y += 1) {
      if ((geometry.pixels[y * geometry.width + x] ?? 255) < 80) dark += 1;
    }
    if (dark >= darkRequired) darkColumns.push(x);
  }
  const groups: VerticalLine[] = [];
  for (const x of darkColumns) {
    const last = groups.at(-1);
    if (!last || x > last.right + 1) groups.push({ left: x, right: x });
    else last.right = x;
  }
  const borders = groups.filter((group) => group.right - group.left + 1 >= 2);
  const outer = borders.at(-1);
  if (!outer || outer.right < 1500) return null;
  const candidates = borders.filter((group) => {
    const center = (group.left + group.right) / 2;
    return center > outer.right * 0.48 && center < outer.right * 0.72;
  });
  const start = candidates.at(-1);
  if (!start) return null;
  const boundaries = groups.filter(
    (group) => group.left >= start.left && group.right <= outer.right,
  );
  const selected: VerticalLine[] = [start];
  for (const boundary of boundaries) {
    const previous = selected.at(-1)!;
    if (boundary.left - previous.right >= 60) selected.push(boundary);
  }
  if (selected.at(-1) !== outer) selected.push(outer);
  const columns = selected.slice(0, -1).map((boundary, index) => ({
    left: boundary.right + 1,
    right: selected[index + 1]!.left,
  }));
  return columns.length >= 1 && columns.length <= 12 ? columns : null;
}

async function readJson<T>(url: URL): Promise<T> {
  return JSON.parse(await readFile(url, "utf8")) as T;
}

async function mapLimit<T>(
  values: readonly T[],
  limit: number,
  task: (value: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (cursor < values.length) {
        const value = values[cursor++];
        if (value) await task(value);
      }
    }),
  );
}

async function mapLimitResults<T, R>(
  values: readonly T[],
  limit: number,
  task: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (cursor < values.length) {
        const index = cursor++;
        const value = values[index];
        if (value) results[index] = await task(value);
      }
    }),
  );
  return results;
}

async function prepare(): Promise<void> {
  const [catalog, programs] = await Promise.all([
    readJson<Catalog>(catalogUrl),
    readJson<Program[]>(programsUrl),
  ]);
  const programByCode = new Map(programs.map((program) => [program.programCode, program]));
  const schoolIds = [...new Set(catalog.programs.map((program) => program.schoolId))];
  const ocrBySchool = new Map<string, OcrIndex | null>();
  const geometryBySchool = new Map<string, ImageGeometry | null>();
  await Promise.all(
    schoolIds.map(async (schoolId) => {
      const [ocr, geometry] = await Promise.all([
        readJson<OcrDocument>(new URL(`${schoolId}.json`, ocrRoot))
          .then(createOcrIndex)
          .catch(() => null),
        readImageGeometry(schoolId),
      ]);
      ocrBySchool.set(schoolId, ocr);
      geometryBySchool.set(schoolId, geometry);
    }),
  );
  for (const schoolId of schoolIds) {
    inferMissingCodeRows(
      catalog.programs.filter((program) => program.schoolId === schoolId),
      ocrBySchool.get(schoolId) ?? null,
    );
  }

  const cells: CropCell[] = [];
  const structuralIssues: Array<Record<string, unknown>> = [];
  for (const catalogProgram of catalog.programs) {
    const program = programByCode.get(catalogProgram.programCode);
    if (!program || program.evaluationSupport !== "supported") continue;
    const derived = deriveRuleSubjects(catalogProgram.items).rules;
    if (derived.length === 0 && program.screeningRules.length === 0) continue;
    const structureMatches =
      derived.length === program.screeningRules.length &&
      derived.every((rule, index) =>
        rule.subjects.join("|") ===
        (program.screeningRules[index]?.subjects ?? []).join("|"),
      );
    if (!structureMatches) {
      structuralIssues.push({
        programCode: program.programCode,
        schoolName: program.schoolName,
        programName: program.programName,
        kind: "rule-structure-mismatch",
        derived,
        stored: program.screeningRules,
      });
      continue;
    }
    const index = ocrBySchool.get(program.schoolId) ?? null;
    const geometry = geometryBySchool.get(program.schoolId) ?? null;
    const codeWord = index?.wordByCode.get(program.programCode);
    if (!index || !geometry || !codeWord) {
      structuralIssues.push({
        programCode: program.programCode,
        schoolName: program.schoolName,
        programName: program.programName,
        kind: "missing-row-or-image-geometry",
      });
      continue;
    }
    const centerY = codeWord.boundingBox.y + codeWord.boundingBox.height / 2;
    const row = tableRowBounds(centerY, geometry);
    const columns = screeningColumns(centerY, geometry);
    if (!row || !columns || columns.length < derived.length) {
      structuralIssues.push({
        programCode: program.programCode,
        schoolName: program.schoolName,
        programName: program.programName,
        kind: "missing-table-boundaries",
        derivedRuleCount: derived.length,
        detectedColumnCount: columns?.length ?? 0,
      });
      continue;
    }
    for (const [index, rule] of derived.entries()) {
      const column = columns[index]!;
      const left = Math.max(0, Math.floor(column.left + 2));
      const right = Math.min(geometry.width, Math.ceil(column.right - 2));
      const top = Math.max(0, row.top + 2);
      const bottom = Math.min(geometry.height, row.bottom - 2);
      const imagePath = fileURLToPath(
        new URL(`${program.programCode}-${index + 1}.png`, cellRoot),
      );
      const digitImagePath = fileURLToPath(
        new URL(`${program.programCode}-${index + 1}-digits.png`, cellRoot),
      );
      cells.push({
        programCode: program.programCode,
        schoolId: program.schoolId,
        schoolName: program.schoolName,
        programName: program.programName,
        order: index + 1,
        subjects: rule.subjects,
        expectedScore: program.screeningRules[index]!.minScore,
        imagePath,
        // The OCR runner uses an English recognizer for tailImagePath. This
        // tight crop is derived from the rightmost ink, where the score lives.
        tailImagePath: digitImagePath,
        sourceImagePath: fileURLToPath(
          new URL(`${program.schoolId}.png`, imageRoot),
        ),
        left,
        top,
        width: right - left,
        height: bottom - top,
      });
    }
  }

  await mkdir(cellRoot, { recursive: true });
  await mapLimit(cells, 12, async (cell) => {
    const base = await sharp(cell.sourceImagePath)
      .extract({
        left: cell.left,
        top: cell.top,
        width: cell.width,
        height: cell.height,
      })
      .resize({ width: cell.width * 6, kernel: sharp.kernel.lanczos3 })
      // Official PNG rows may contain transparency. Flattening is essential:
      // WinRT OCR otherwise interprets transparent pixels as black and can see
      // only the last digit (the exact failure this audit is designed to find).
      .flatten({ background: "#ffffff" })
      .greyscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();
    await sharp(base)
      .extend({
        top: 30,
        bottom: 30,
        left: 30,
        right: 30,
        background: "#ffffff",
      })
      .png()
      .toFile(cell.imagePath);
    const { data, info } = await sharp(base)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let minX = info.width;
    let minY = info.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        if ((data[y * info.width + x] ?? 255) >= 180) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    if (maxX < minX || maxY < minY) {
      await sharp({
        create: { width: 300, height: 180, channels: 3, background: "white" },
      }).png().toFile(cell.tailImagePath);
      return;
    }
    const digitLeft = Math.max(minX, maxX - 219);
    await sharp(base)
      .extract({
        left: digitLeft,
        top: minY,
        width: maxX - digitLeft + 1,
        height: maxY - minY + 1,
      })
      .extend({
        top: 50,
        bottom: 50,
        left: 50,
        right: 50,
        background: "#ffffff",
      })
      .png()
      .toFile(cell.tailImagePath);
  });
  const manifest: CellManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "CAC 114 official PNG redownloaded independently for threshold audit",
    cells,
    structuralIssues,
  };
  await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(
    `Prepared ${cells.length} independently cropped rule cells; structural issues: ${structuralIssues.length}`,
  );
  console.log(fileURLToPath(manifestUrl));
}

function trailingScore(value: string): number | null {
  const compact = normalize(value);
  const match = compact.match(/(\d{1,2})$/u);
  if (!match) return null;
  const score = Number(match[1]);
  return Number.isInteger(score) ? score : null;
}

function splitRecognizerLines(lines: readonly OcrLine[]): {
  zh: OcrLine[];
  en: OcrLine[];
} {
  const reset = lines.findIndex(
    (line, index) => index > 0 && line.index === 0,
  );
  return reset < 0
    ? { zh: [...lines], en: [] }
    : { zh: lines.slice(0, reset), en: lines.slice(reset) };
}

function recognizerCandidates(lines: readonly OcrLine[]): number[] {
  const combined = lines.map((line) => line.text ?? "").join(" ").trim();
  const lastLine = [...lines].reverse().find((line) => (line.text ?? "").trim());
  const lastWord = [...lines]
    .reverse()
    .flatMap((line) => [...(line.words ?? [])].reverse())
    .find((word) => word.text.trim());
  return [
    ...new Set(
      [combined, lastLine?.text ?? "", lastWord?.text ?? ""]
        .map(trailingScore)
        .filter((score): score is number => score !== null),
    ),
  ];
}

async function compare(): Promise<void> {
  const manifest = await readJson<CellManifest>(manifestUrl);
  const cellOcr = await readJson<{ cells?: CellOcr[] }>(cellOcrUrl);
  const ocrByKey = new Map(
    (cellOcr.cells ?? []).map((cell) => [
      `${cell.programCode}-${cell.order}`,
      cell,
    ]),
  );
  const results = manifest.cells.map((cell) => {
    const key = `${cell.programCode}-${cell.order}`;
    const ocr = ocrByKey.get(key);
    const split = splitRecognizerLines(ocr?.lines ?? []);
    const zhCandidates = recognizerCandidates(split.zh);
    const enCandidates = recognizerCandidates(split.en);
    const maximum = cell.subjects.length * 15;
    const usableZh = zhCandidates.filter((score) => score <= maximum);
    const usableEn = enCandidates.filter((score) => score <= maximum);
    const combined = [...new Set([...usableZh, ...usableEn])];
    const expectedSeen = combined.includes(cell.expectedScore);
    const alternativeScores = combined.filter(
      (score) => score !== cell.expectedScore,
    );
    let classification:
      | "confirmed-two-pass"
      | "confirmed-one-pass"
      | "disagreement"
      | "ambiguous";
    if (
      usableZh.includes(cell.expectedScore) &&
      usableEn.includes(cell.expectedScore) &&
      alternativeScores.length === 0
    ) {
      classification = "confirmed-two-pass";
    } else if (expectedSeen && alternativeScores.length === 0) {
      classification = "confirmed-one-pass";
    } else if (!expectedSeen && combined.length === 1) {
      classification = "disagreement";
    } else {
      classification = "ambiguous";
    }
    return {
      key,
      programCode: cell.programCode,
      schoolId: cell.schoolId,
      schoolName: cell.schoolName,
      programName: cell.programName,
      order: cell.order,
      subjects: cell.subjects,
      expectedScore: cell.expectedScore,
      maximum,
      classification,
      zhCandidates: usableZh,
      enCandidates: usableEn,
      suggestedScore:
        classification === "disagreement" ? combined[0] : undefined,
      ocrStatus: ocr?.status ?? "missing",
      ocrText: ocr?.text ?? "",
      imagePath: cell.imagePath,
    };
  });
  const counts = Object.fromEntries(
    [...Map.groupBy(results, (result) => result.classification)].map(
      ([classification, entries]) => [classification, entries.length],
    ),
  );
  const report = {
    academicYear: 114,
    generatedAt: new Date().toISOString(),
    officialImageCount: 66,
    auditedRuleCellCount: manifest.cells.length,
    structuralIssueCount: manifest.structuralIssues.length,
    counts,
    disagreements: results.filter(
      (result) => result.classification === "disagreement",
    ),
    ambiguous: results.filter((result) => result.classification === "ambiguous"),
    onePassOnly: results.filter(
      (result) => result.classification === "confirmed-one-pass",
    ),
    structuralIssues: manifest.structuralIssues,
    results,
  };
  await writeFile(reportUrl, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    auditedRuleCellCount: report.auditedRuleCellCount,
    structuralIssueCount: report.structuralIssueCount,
    counts: report.counts,
    disagreements: report.disagreements.length,
    ambiguous: report.ambiguous.length,
  }, null, 2));
  console.log(fileURLToPath(reportUrl));
}

const GLYPH_WIDTH = 48;
const GLYPH_HEIGHT = 48;
const GLYPH_DARK_THRESHOLD = 100;
const GLYPH_ACCEPTANCE_THRESHOLD = 0.065;

type GlyphFeature = {
  pixels: number[];
  aspect: number;
  sourceWidth: number;
  sourceHeight: number;
};

type DigitPrototype = { pixels: number[]; aspect: number };

async function trailingGlyphs(imagePath: string): Promise<GlyphFeature[]> {
  const { data, info } = await sharp(imagePath)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const groupPositions = (
    positions: readonly number[],
    toleratedGap: number,
  ): Array<{ start: number; end: number }> => {
    const groups: Array<{ start: number; end: number }> = [];
    for (const position of positions) {
      const last = groups.at(-1);
      if (!last || position > last.end + toleratedGap + 1) {
        groups.push({ start: position, end: position });
      } else {
        last.end = position;
      }
    }
    return groups;
  };

  const darkRows: number[] = [];
  for (let y = 0; y < info.height; y += 1) {
    let hasInk = false;
    for (let x = 0; x < info.width; x += 1) {
      if ((data[y * info.width + x] ?? 255) < GLYPH_DARK_THRESHOLD) {
        hasInk = true;
        break;
      }
    }
    if (hasInk) darkRows.push(y);
  }
  const scoreLine = groupPositions(darkRows, 4).at(-1);
  if (!scoreLine) return [];

  const darkColumns: number[] = [];
  for (let x = 0; x < info.width; x += 1) {
    let hasInk = false;
    for (let y = scoreLine.start; y <= scoreLine.end; y += 1) {
      if ((data[y * info.width + x] ?? 255) < GLYPH_DARK_THRESHOLD) {
        hasInk = true;
        break;
      }
    }
    if (hasInk) darkColumns.push(x);
  }

  return groupPositions(darkColumns, 1).flatMap((run) => {
    let left = run.end;
    let right = run.start;
    let top = scoreLine.end;
    let bottom = scoreLine.start;
    for (let y = scoreLine.start; y <= scoreLine.end; y += 1) {
      for (let x = run.start; x <= run.end; x += 1) {
        if ((data[y * info.width + x] ?? 255) >= GLYPH_DARK_THRESHOLD) {
          continue;
        }
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
    if (right < left || bottom < top) return [];
    const sourceWidth = right - left + 1;
    const sourceHeight = bottom - top + 1;
    const scale = Math.min(
      (GLYPH_WIDTH - 6) / sourceWidth,
      (GLYPH_HEIGHT - 6) / sourceHeight,
    );
    const placedWidth = Math.max(1, Math.round(sourceWidth * scale));
    const placedHeight = Math.max(1, Math.round(sourceHeight * scale));
    const offsetX = Math.floor((GLYPH_WIDTH - placedWidth) / 2);
    const offsetY = Math.floor((GLYPH_HEIGHT - placedHeight) / 2);
    const pixels = new Array<number>(GLYPH_WIDTH * GLYPH_HEIGHT).fill(0);
    for (let targetY = 0; targetY < placedHeight; targetY += 1) {
      const sourceY = Math.min(
        bottom,
        top + Math.floor(targetY / scale),
      );
      for (let targetX = 0; targetX < placedWidth; targetX += 1) {
        const sourceX = Math.min(
          right,
          left + Math.floor(targetX / scale),
        );
        if (
          (data[sourceY * info.width + sourceX] ?? 255) <
          GLYPH_DARK_THRESHOLD
        ) {
          pixels[(targetY + offsetY) * GLYPH_WIDTH + targetX + offsetX] = 1;
        }
      }
    }
    return [{
      pixels,
      aspect: sourceWidth / sourceHeight,
      sourceWidth,
      sourceHeight,
    }];
  });
}

function makePrototype(samples: readonly GlyphFeature[]): DigitPrototype {
  const pixels = new Array<number>(GLYPH_WIDTH * GLYPH_HEIGHT).fill(0);
  let aspect = 0;
  for (const sample of samples) {
    aspect += sample.aspect;
    for (let index = 0; index < pixels.length; index += 1) {
      pixels[index] = (pixels[index] ?? 0) + (sample.pixels[index] ?? 0);
    }
  }
  return {
    pixels: pixels.map((value) => value / samples.length),
    aspect: aspect / samples.length,
  };
}

function glyphDistance(
  glyph: GlyphFeature,
  prototype: DigitPrototype,
): number {
  let pixels = 0;
  for (let index = 0; index < glyph.pixels.length; index += 1) {
    const difference =
      (glyph.pixels[index] ?? 0) - (prototype.pixels[index] ?? 0);
    pixels += difference * difference;
  }
  const aspectDifference = glyph.aspect - prototype.aspect;
  return pixels / glyph.pixels.length + aspectDifference * aspectDifference * 0.15;
}

async function pixelCompare(): Promise<void> {
  const [manifest, ocrReport] = await Promise.all([
    readJson<CellManifest>(manifestUrl),
    readJson<{ results: Array<{ key: string; classification: string }> }>(
      reportUrl,
    ),
  ]);
  const ocrClassificationByKey = new Map(
    ocrReport.results.map((result) => [result.key, result.classification]),
  );
  const extracted = await mapLimitResults(manifest.cells, 16, async (cell) => ({
    cell,
    glyphs: await trailingGlyphs(cell.imagePath),
  }));
  const training = new Map<string, GlyphFeature[]>();
  for (const { cell, glyphs } of extracted) {
    const digits = String(cell.expectedScore);
    const key = `${cell.programCode}-${cell.order}`;
    if (
      cell.expectedScore <= 0 ||
      ocrClassificationByKey.get(key) !== "confirmed-two-pass" ||
      glyphs.length < digits.length
    ) {
      continue;
    }
    const scoreGlyphs = glyphs.slice(-digits.length);
    for (const [index, digit] of [...digits].entries()) {
      const glyph = scoreGlyphs[index];
      if (!glyph || glyph.sourceWidth > 55 || glyph.sourceHeight < 45) continue;
      const samples = training.get(digit) ?? [];
      samples.push(glyph);
      training.set(digit, samples);
    }
  }
  const initial = new Map(
    [...training].map(([digit, samples]) => [digit, makePrototype(samples)]),
  );
  const prototypes = new Map<string, DigitPrototype>();
  const retainedCounts: Record<string, number> = {};
  for (const [digit, samples] of training) {
    const prototype = initial.get(digit)!;
    const ranked = samples
      .map((sample) => ({ sample, distance: glyphDistance(sample, prototype) }))
      .sort((left, right) => left.distance - right.distance);
    const retained = ranked
      .slice(0, Math.max(10, Math.floor(ranked.length * 0.9)))
      .map(({ sample }) => sample);
    prototypes.set(digit, makePrototype(retained));
    retainedCounts[digit] = retained.length;
  }
  const missingDigits = Array.from({ length: 10 }, (_, digit) => String(digit))
    .filter((digit) => !prototypes.has(digit));
  if (missingDigits.length > 0) {
    throw new Error(`OCR seed set is missing digit prototypes: ${missingDigits.join(", ")}`);
  }

  function classify(glyph: GlyphFeature): {
    digit: string;
    distance: number;
    margin: number;
  } {
    const ranked = [...prototypes].map(([digit, prototype]) => ({
      digit,
      distance: glyphDistance(glyph, prototype),
    })).sort((left, right) => left.distance - right.distance);
    return {
      digit: ranked[0]?.digit ?? "",
      distance: ranked[0]?.distance ?? Number.POSITIVE_INFINITY,
      margin:
        (ranked[1]?.distance ?? Number.POSITIVE_INFINITY) -
        (ranked[0]?.distance ?? Number.POSITIVE_INFINITY),
    };
  }

  const results = extracted.map(({ cell, glyphs }) => {
    const trailing = glyphs.slice(-2).map((glyph) => ({
      glyph,
      classified: classify(glyph),
    }));
    const accepted = trailing.filter(
      ({ glyph, classified }) =>
        glyph.sourceWidth <= 55 &&
        glyph.sourceHeight >= 45 &&
        classified.distance <= GLYPH_ACCEPTANCE_THRESHOLD &&
        classified.margin >= 0.003,
    );
    let predictedScore: number | null = cell.expectedScore === 0 ? 0 : null;
    if (cell.expectedScore > 0 && accepted.length > 0) {
      const value = Number(
        accepted.map(({ classified }) => classified.digit).join(""),
      );
      if (
        Number.isInteger(value) &&
        value > 0 &&
        value <= cell.subjects.length * 15
      ) {
        predictedScore = value;
      }
    }
    const classification =
      predictedScore === null
        ? "ambiguous"
        : predictedScore === cell.expectedScore
          ? "confirmed"
          : "disagreement";
    return {
      key: `${cell.programCode}-${cell.order}`,
      programCode: cell.programCode,
      schoolId: cell.schoolId,
      schoolName: cell.schoolName,
      programName: cell.programName,
      order: cell.order,
      subjects: cell.subjects,
      expectedScore: cell.expectedScore,
      predictedScore,
      classification,
      glyphCount: glyphs.length,
      glyphWidths: glyphs.map((glyph) => glyph.sourceWidth),
      classified: trailing.map(({ classified }) => classified),
      imagePath: cell.imagePath,
    };
  });
  const counts = Object.fromEntries(
    [...Map.groupBy(results, (result) => result.classification)].map(
      ([classification, entries]) => [classification, entries.length],
    ),
  );
  const report = {
    academicYear: 114,
    generatedAt: new Date().toISOString(),
    method:
      "last-line glyph segmentation with two-pass OCR-seeded official-font prototypes",
    auditedRuleCellCount: manifest.cells.length,
    acceptanceThreshold: GLYPH_ACCEPTANCE_THRESHOLD,
    retainedTrainingGlyphCounts: retainedCounts,
    counts,
    disagreements: results.filter(
      (result) => result.classification === "disagreement",
    ),
    ambiguous: results.filter((result) => result.classification === "ambiguous"),
    results,
  };
  await writeFile(pixelReportUrl, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    auditedRuleCellCount: report.auditedRuleCellCount,
    acceptanceThreshold: report.acceptanceThreshold,
    retainedTrainingGlyphCounts: report.retainedTrainingGlyphCounts,
    counts: report.counts,
    disagreements: report.disagreements.length,
    ambiguous: report.ambiguous.length,
  }, null, 2));
  console.log(fileURLToPath(pixelReportUrl));
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]!);
}

async function makeAmbiguousSheets(): Promise<void> {
  const [pixelReport, ocrReport] = await Promise.all([
    readJson<{
      ambiguous: Array<{
        key: string;
        schoolName: string;
        programName: string;
        expectedScore: number;
        imagePath: string;
      }>;
    }>(pixelReportUrl),
    readJson<{ results: Array<{ key: string; classification: string }> }>(reportUrl),
  ]);
  const ocrByKey = new Map(
    ocrReport.results.map((result) => [result.key, result.classification]),
  );
  const cells = pixelReport.ambiguous.filter(
    (cell) => ocrByKey.get(cell.key) !== "confirmed-two-pass",
  );
  const outputRoot = new URL("review-sheets/", auditRoot);
  await mkdir(outputRoot, { recursive: true });
  const cardWidth = 600;
  const cardHeight = 190;
  const columns = 3;
  const rows = 5;
  const perSheet = columns * rows;
  const sheets: Array<{ path: string; keys: string[] }> = [];
  for (let offset = 0; offset < cells.length; offset += perSheet) {
    const page = cells.slice(offset, offset + perSheet);
    const composites: sharp.OverlayOptions[] = [];
    for (const [index, cell] of page.entries()) {
      const left = (index % columns) * cardWidth;
      const top = Math.floor(index / columns) * cardHeight;
      const labelText = `${cell.key} expected=${cell.expectedScore} ${cell.schoolName}`;
      const label = Buffer.from(
        `<svg width="${cardWidth}" height="42" xmlns="http://www.w3.org/2000/svg">` +
          `<rect width="100%" height="100%" fill="#102632"/>` +
          `<text x="10" y="27" fill="white" font-family="Arial, sans-serif" ` +
          `font-size="18" font-weight="700">${escapeXml(labelText)}</text></svg>`,
      );
      const image = await sharp(cell.imagePath)
        .resize({
          width: cardWidth - 24,
          height: cardHeight - 54,
          fit: "contain",
          background: "white",
        })
        .png()
        .toBuffer();
      composites.push({ input: label, left, top });
      composites.push({ input: image, left: left + 12, top: top + 48 });
    }
    const sheetNumber = Math.floor(offset / perSheet) + 1;
    const path = fileURLToPath(
      new URL(`review-${String(sheetNumber).padStart(2, "0")}.png`, outputRoot),
    );
    await sharp({
      create: {
        width: cardWidth * columns,
        height: cardHeight * rows,
        channels: 3,
        background: "white",
      },
    }).composite(composites).png().toFile(path);
    sheets.push({ path, keys: page.map((cell) => cell.key) });
  }
  await writeFile(
    new URL("index.json", outputRoot),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), cells, sheets }, null, 2)}\n`,
    "utf8",
  );
  console.log(`Created ${sheets.length} sheets for ${cells.length} unresolved cells.`);
  console.log(fileURLToPath(outputRoot));
}

async function mergeBatches(batchCount = 4): Promise<void> {
  const batches = await Promise.all(
    Array.from({ length: batchCount }, (_, index) =>
      readJson<{ cells?: CellOcr[] }>(
        new URL(`../official-114-audit-batch-${index}/threshold-cell-ocr.json`, auditRoot),
      ),
    ),
  );
  const cells = batches.flatMap((batch) => batch.cells ?? []);
  const uniqueKeys = new Set(cells.map((cell) => `${cell.programCode}-${cell.order}`));
  if (uniqueKeys.size !== cells.length) {
    throw new Error(`Merged OCR batches contain duplicate keys: ${cells.length}/${uniqueKeys.size}`);
  }
  await writeFile(
    cellOcrUrl,
    `${JSON.stringify({
      schemaVersion: 1,
      generatedAtUtc: new Date().toISOString(),
      recognizer: "Windows.Media.Ocr zh-Hant-TW plus en-US full-cell passes",
      cells,
    }, null, 2)}\n`,
    "utf8",
  );
  console.log(`Merged ${cells.length} OCR cells from ${batchCount} batches.`);
  console.log(fileURLToPath(cellOcrUrl));
}

const command = process.argv[2] ?? "compare";
if (command === "prepare") await prepare();
else if (command === "merge") await mergeBatches(Number(process.argv[3] ?? 4));
else if (command === "compare") await compare();
else if (command === "pixel") await pixelCompare();
else if (command === "sheets") await makeAmbiguousSheets();
else throw new Error(`Unknown command: ${command}; use prepare, merge, compare, pixel, or sheets`);
