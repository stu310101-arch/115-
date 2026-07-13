import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import {
  scoreFor114Standard,
  scoreForEnglishListening,
} from "../lib/subjects.ts";
import type {
  AdditionalScreeningRule,
  GroupTag,
  ListeningStandard,
  Program,
  ProgramScreeningVariant,
  ProgramSource,
  RequirementStandard,
  ScreeningRule,
  SpecialScreeningGroup,
  Subject,
  SubjectRequirement,
} from "../lib/types.ts";
import { validatePrograms } from "./validatePrograms.ts";

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
  quota: number | null;
  detailUrl: string;
  items: CatalogItem[];
  raw?: { listRowHtml?: string; requiresApcs?: boolean };
};

type Catalog = {
  academicYear: number;
  declaredSchoolCount: number;
  declaredProgramCount: number;
  programs: CatalogProgram[];
  validation: {
    actualSchoolCount: number;
    actualProgramCount: number;
    uniqueProgramCodeCount: number;
    schoolCountsMatch: boolean;
    totalCountMatches: boolean;
    programCodesUnique: boolean;
  };
};

type SourceIndexEntry = ProgramSource & {
  schoolId: string;
  schoolName: string;
};

type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type OcrWord = {
  text: string;
  boundingBox: BoundingBox;
};

type OcrDocument = {
  status: string;
  schoolId: string;
  image?: { width: number; height: number };
  lines?: Array<{ words?: OcrWord[] }>;
};

type DerivedRule = {
  multiplier: number;
  subjects: Subject[];
};

type RuleDerivation = {
  rules: DerivedRule[];
  issues: string[];
};

type RequirementDerivation = {
  requirements: SubjectRequirement[];
  issues: string[];
};

type OcrIndex = {
  wordByCode: Map<string, OcrWord>;
  words: OcrWord[];
  width: number;
  rowTolerance: number;
};

type ImageGeometry = {
  pixels: Buffer;
  width: number;
  height: number;
  horizontalLines: number[];
};

type ReviewEntry = {
  schoolId: string;
  schoolName: string;
  programCode: string;
  programName: string;
  reasons: string[];
  detailUrl: string;
};

type ProgramOverride = {
  screeningVariants?: ProgramScreeningVariant[];
  additionalScreeningRules?: AdditionalScreeningRule[];
  specialScreeningGroups?: SpecialScreeningGroup[];
  reviewReasons?: string[];
};

type TargetedCellOcr = {
  programCode: string;
  order: number;
  text: string;
  lines?: Array<{ text?: string; words?: OcrWord[] }>;
};

type CropRequest = {
  programCode: string;
  schoolId: string;
  order: number;
  imagePath: string;
  tailImagePath: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

const EXPECTED_SCHOOL_COUNT = 66;
const EXPECTED_PROGRAM_COUNT = 2168;
const EXPECTED_APCS_PROGRAM_COUNT = 60;
const EXPECTED_ART_EXAM_PROGRAM_COUNT = 70;
const MAX_ORDER_COLUMNS = 12;
const FIVE_STANDARDS = new Set<RequirementStandard>([
  "頂標",
  "前標",
  "均標",
  "後標",
  "底標",
]);
const LISTENING_STANDARDS = new Set<ListeningStandard>([
  "A級",
  "B級",
  "C級",
]);
const SUBJECT_ORDER: readonly Subject[] = [
  "國文",
  "英文",
  "數A",
  "數B",
  "社會",
  "自然",
  "英聽",
];

/**
 * Official special-screening details that are not yet represented by the
 * site's automatic evaluator. Keep these notes in the generated program data
 * so search results can explain exactly why a result is incomplete.
 */
const SPECIAL_SCREENING_DETAILS_BY_CODE: Readonly<
  Record<string, readonly string[]>
> = {
  "002282": [
    "官方另列最低篩選分數：英文 8、數學A 10、APCS 觀念題＋實作題合計 7；這些特殊條件尚未納入自動判斷",
  ],
  "002452": [
    "招生名額 64 名為鋼琴、聲樂、小提琴、中提琴等 19 種主修樂器名額加總；各主修樂器的名額與術科最低分不同，須依官方資料逐項確認",
  ],
  "002472": [
    "官方最低分：國文＋英文 34、素描＋彩繪技法＋創意表現 213；術科條件尚未納入自動判斷",
  ],
  "002482": [
    "官方最低分：國文＋英文 28、彩繪技法 72、素描 75；術科條件尚未納入自動判斷",
  ],
  "002492": [
    "官方最低分：國文＋英文 26、彩繪技法 69、素描 69、水墨書畫 79.8；術科條件尚未納入自動判斷",
  ],
  "002502": [
    "官方另列最低分：體育百分等級 75.36、國文＋英文 30；術科條件尚未納入自動判斷",
  ],
  "002512": [
    "官方另列最低分：體育百分等級 75.3、國文＋英文 37；術科條件尚未納入自動判斷",
  ],
  "002522": [
    "官方另列最低分：體育百分等級 82.7、國文＋英文 43；術科條件尚未納入自動判斷",
  ],
};

const catalogUrl = new URL("../work/official-114/catalog.json", import.meta.url);
const ocrDirectoryUrl = new URL("../work/official-114/ocr/", import.meta.url);
const imageDirectoryUrl = new URL("../work/official-114/images/", import.meta.url);
const sourceIndexUrl = new URL("../data/sources_114.json", import.meta.url);
const outputUrl = new URL("../data/programs_114.json", import.meta.url);
const reviewUrl = new URL("../work/official-114/review.json", import.meta.url);
const cellOcrUrl = new URL(
  "../work/official-114/threshold-cell-ocr.json",
  import.meta.url,
);
const thresholdOverrideUrl = new URL(
  "../data/official_threshold_overrides_114.json",
  import.meta.url,
);
const programOverrideUrl = new URL(
  "../data/official_program_overrides_114.json",
  import.meta.url,
);
const cellDirectoryUrl = new URL(
  "../work/official-114/threshold-cells/",
  import.meta.url,
);

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\s\u3000]/gu, "")
    .replace(/[‐‑‒–—―−]/gu, "-");
}

/** Convert official single/combined item labels into the site's subjects. */
export function parseSubjectsFromLabel(label: string): Subject[] | null {
  if (normalize(label) === "英聽") return ["英聽"];
  let compact = normalize(label)
    .replace(/[()（）\[\]【】+＋、,，/／]/gu, "")
    .replace(/學測/gu, "")
    .replace(/科目/gu, "")
    .replace(/組合/gu, "")
    .replace(/級分/gu, "")
    .replace(/總和/gu, "")
    .replace(/國文/gu, "國")
    .replace(/英文/gu, "英")
    .replace(/數學A/giu, "數A")
    .replace(/數學B/giu, "數B")
    .replace(/社會/gu, "社")
    .replace(/自然/gu, "自");

  if (!compact) return null;
  const subjects: Subject[] = [];
  while (compact.length > 0) {
    let subject: Subject | undefined;
    let consumed = 0;
    if (compact.startsWith("數A")) {
      subject = "數A";
      consumed = 2;
    } else if (compact.startsWith("數B")) {
      subject = "數B";
      consumed = 2;
    } else {
      const single: Record<string, Subject> = {
        國: "國文",
        英: "英文",
        社: "社會",
        自: "自然",
      };
      subject = single[compact[0] ?? ""];
      consumed = subject ? 1 : 0;
    }
    if (!subject || consumed === 0) return null;
    if (!subjects.includes(subject)) subjects.push(subject);
    compact = compact.slice(consumed);
  }
  return SUBJECT_ORDER.filter((subject) => subjects.includes(subject));
}

function parseMultiplier(value: string): number | null | "invalid" {
  const compact = normalize(value);
  if (!compact || /^-+$/.test(compact)) return null;
  if (!/^\d+(?:\.\d+)?$/.test(compact)) return "invalid";
  const parsed = Number(compact);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : "invalid";
}

/** Same multiplier means a combined screening gate; larger multiplier is first. */
export function deriveRuleSubjects(items: readonly CatalogItem[]): RuleDerivation {
  const byMultiplier = new Map<number, Subject[]>();
  const issues: string[] = [];
  for (const item of items) {
    const multiplier = parseMultiplier(item.multiplier);
    if (multiplier === null) continue;
    if (multiplier === "invalid") {
      issues.push(`無法解析篩選倍率「${item.label}:${item.multiplier}」`);
      continue;
    }
    const subjects = parseSubjectsFromLabel(item.label);
    if (!subjects || subjects.length === 0) {
      issues.push(`無法解析倍率篩選科目「${item.label}」`);
      continue;
    }
    const group = byMultiplier.get(multiplier) ?? [];
    for (const subject of subjects) {
      if (!group.includes(subject)) group.push(subject);
    }
    byMultiplier.set(multiplier, group);
  }

  const rules = [...byMultiplier.entries()]
    .sort(([left], [right]) => right - left)
    .map(([multiplier, subjects]) => ({
      multiplier,
      subjects: SUBJECT_ORDER.filter((subject) => subjects.includes(subject)),
    }));
  if (rules.length > MAX_ORDER_COLUMNS) {
    issues.push(`篩選關數 ${rules.length} 超過官方表格欄數 ${MAX_ORDER_COLUMNS}`);
  }
  return { rules, issues };
}

function deriveRequirements(items: readonly CatalogItem[]): RequirementDerivation {
  const requirements: SubjectRequirement[] = [];
  const issues: string[] = [];
  for (const item of items) {
    const rawStandard = normalize(item.standard);
    if (!rawStandard || /^-+$/.test(rawStandard)) continue;
    const subjects = parseSubjectsFromLabel(item.label);
    if (
      subjects?.length === 1 &&
      subjects[0] === "英聽" &&
      LISTENING_STANDARDS.has(rawStandard as ListeningStandard)
    ) {
      const standard = rawStandard as ListeningStandard;
      requirements.push({
        subject: "英聽",
        standard,
        minScore: scoreForEnglishListening(standard),
        rawText: `${item.label}${item.standard}`,
      });
      continue;
    }
    if (
      !FIVE_STANDARDS.has(rawStandard as RequirementStandard) ||
      !subjects ||
      subjects.length !== 1
    ) {
      issues.push(`無法安全換算檢定標準「${item.label}:${item.standard}」`);
      continue;
    }
    const subject = subjects[0] as Exclude<Subject, "英聽">;
    const standard = rawStandard as RequirementStandard;
    const key = `${subject}:${standard}`;
    if (
      requirements.some(
        (requirement) =>
          `${requirement.subject}:${requirement.standard}` === key,
      )
    ) {
      continue;
    }
    requirements.push({
      subject,
      standard,
      minScore: scoreFor114Standard(subject, standard),
      rawText: `${item.label}${item.standard}`,
    });
  }
  return { requirements, issues };
}

function median(values: number[]): number {
  if (values.length === 0) return 24;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 24);
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
  const centers = [...wordByCode.values()]
    .map((word) => word.boundingBox.y + word.boundingBox.height / 2)
    .sort((left, right) => left - right);
  const gaps = centers
    .slice(1)
    .map((center, index) => center - (centers[index] ?? center))
    .filter((gap) => gap >= 8 && gap <= 80);
  const typicalGap = median(gaps);
  return {
    wordByCode,
    words,
    width: document.image.width,
    rowTolerance: Math.max(12, Math.min(28, typicalGap * 0.48)),
  };
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
      fileURLToPath(new URL(`${schoolId}.png`, imageDirectoryUrl)),
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
    const horizontalLines = rowGroups.map(
      (group) => group[Math.floor(group.length / 2)]!,
    );
    return {
      pixels: data,
      width: info.width,
      height: info.height,
      horizontalLines,
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

/**
 * The official PNG can stitch pages rendered at 2008, 2488, or 2828 pixels
 * into one image. Reading the actual vertical table borders at this row is
 * therefore safer than applying one global width ratio.
 */
function screeningColumnEdges(
  centerY: number,
  geometry: ImageGeometry | null,
): {
  start: number;
  end: number;
  columns: Array<{ left: number; right: number }>;
} | null {
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
  const selectedBoundaries: VerticalLine[] = [start];
  for (const boundary of boundaries) {
    const previous = selectedBoundaries.at(-1)!;
    if (boundary.left - previous.right >= 60) selectedBoundaries.push(boundary);
  }
  if (selectedBoundaries.at(-1) !== outer) selectedBoundaries.push(outer);
  const columns = selectedBoundaries.slice(0, -1).map((boundary, index) => ({
    left: boundary.right + 1,
    right: selectedBoundaries[index + 1]!.left,
  }));
  if (columns.length < 1 || columns.length > MAX_ORDER_COLUMNS) return null;
  return {
    start: start.right + 1,
    end: outer.left,
    columns,
  };
}

function trailingScore(text: string): number | null {
  const compact = normalize(text);
  // Deliberately reject OCR such as "2S" instead of silently treating it as 2.
  const match = compact.match(/(\d{1,2})$/);
  if (!match) return null;
  const score = Number(match[1]);
  return Number.isInteger(score) ? score : null;
}

function targetedScoreCandidates(cell: TargetedCellOcr | undefined): number[] {
  if (!cell) return [];
  const texts = [
    cell.text,
    ...(cell.lines ?? []).flatMap((line) => [
      line.text ?? "",
      ...(line.words ?? []).map((word) => word.text),
    ]),
  ];
  return [
    ...new Set(
      texts.flatMap((text) => {
        const score = trailingScore(text);
        return score === null ? [] : [score];
      }),
    ),
  ];
}

function thresholdScoresForProgram(
  programCode: string,
  derivedRules: readonly DerivedRule[],
  index: OcrIndex | null,
  geometry: ImageGeometry | null,
  targetedCells: ReadonlyMap<string, TargetedCellOcr>,
  thresholdOverrides: ReadonlyMap<string, number | null>,
): { scores: Array<number | null> | null; reason?: string } {
  if (!index) return { scores: null, reason: "缺少可用的官方表格 OCR" };
  const codeWord = index.wordByCode.get(programCode);
  if (!codeWord) {
    return { scores: null, reason: "OCR 未能精確辨識六位校系代碼，無法安全對列" };
  }
  if (derivedRules.length === 0) {
    return { scores: null, reason: "官方倍率欄無可建立最低級分規則的項目" };
  }
  const centerY = codeWord.boundingBox.y + codeWord.boundingBox.height / 2;
  const edges = screeningColumnEdges(centerY, geometry);
  if (!edges) {
    return { scores: null, reason: "無法確認官方表格的篩選順序欄線" };
  }
  const row = tableRowBounds(centerY, geometry);
  if (!row) {
    return { scores: null, reason: "無法確認官方表格的校系資料列" };
  }
  if (derivedRules.length > edges.columns.length) {
    return { scores: null, reason: "官方倍率篩選關數超出表格欄位" };
  }
  const scores: Array<number | null> = [];
  for (let order = 0; order < derivedRules.length; order += 1) {
    const { left, right } = edges.columns[order]!;
    const maximum = derivedRules[order]!.subjects.length * 15;
    const overrideKey = `${programCode}-${order + 1}`;
    if (thresholdOverrides.has(overrideKey)) {
      const override = thresholdOverrides.get(overrideKey);
      if (override !== null && override !== undefined && (override < 0 || override > maximum)) {
        return {
          scores: null,
          reason: `人工覆核值 ${overrideKey}=${override} 超出科目級分上限`,
        };
      }
      // null means the official table contains "—": this screening gate was
      // not activated and must not be published as a zero-point threshold.
      scores.push(override ?? null);
      continue;
    }
    const candidates = index.words.flatMap((word) => {
      const wordCenterX = word.boundingBox.x + word.boundingBox.width / 2;
      const wordCenterY = word.boundingBox.y + word.boundingBox.height / 2;
      if (
        wordCenterX < left ||
        wordCenterX >= right ||
        wordCenterY <= row.top ||
        wordCenterY >= row.bottom
      ) {
        return [];
      }
      const score = trailingScore(word.text);
      return score !== null && score >= 0 && score <= maximum ? [score] : [];
    });
    let unique = [...new Set(candidates)];
    if (unique.length !== 1) {
      unique = targetedScoreCandidates(
        targetedCells.get(`${programCode}:${order + 1}`),
      ).filter((score) => score >= 0 && score <= maximum);
    }
    if (unique.length !== 1) {
      return {
        scores: null,
        reason:
          unique.length === 0
            ? `OCR 無法確認篩選順序${order + 1}最低級分`
            : `OCR 對篩選順序${order + 1}辨識出多個可能分數`,
      };
    }
    scores.push(unique[0]!);
  }
  return { scores };
}

export function makeRules(
  derived: readonly DerivedRule[],
  scores: readonly (number | null)[],
): ScreeningRule[] {
  const rules: ScreeningRule[] = [];
  derived.forEach((rule, index) => {
    const minScore = scores[index];
    if (minScore === null || minScore === undefined) return;
    const label = rule.subjects.join("＋");
    rules.push({
      order: rules.length + 1,
      label,
      subjects: rule.subjects,
      minScore,
      rawText:
        minScore === 0
          ? `${label}—（官方未啟動倍率篩選）`
          : `${label}${minScore}`,
    });
  });
  return rules;
}

function deriveGroupTags(program: CatalogProgram): GroupTag[] {
  const subjects = new Set(
    program.items.flatMap((item) => parseSubjectsFromLabel(item.label) ?? []),
  );
  const tags: GroupTag[] = [];
  if (subjects.has("數A") || subjects.has("自然")) tags.push("自然組");
  if (subjects.has("數B") || subjects.has("社會")) tags.push("社會組");
  if (tags.length > 0) return tags;

  const name = normalize(program.programName);
  if (/醫|藥|護理|工程|資訊|電機|機械|化學|物理|生物|生命|材料|數學|農|獸醫|建築/u.test(name)) {
    tags.push("自然組");
  }
  if (/法律|管理|金融|經濟|會計|語文|文學|歷史|政治|社會|傳播|教育|藝術/u.test(name)) {
    tags.push("社會組");
  }
  return tags.length > 0 ? tags : ["自然組", "社會組"];
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

async function readJson<T>(url: URL): Promise<T> {
  return JSON.parse(await readFile(url, "utf8")) as T;
}

async function readOcrIndex(schoolId: string): Promise<OcrIndex | null> {
  try {
    const document = await readJson<OcrDocument>(
      new URL(`${schoolId}.json`, ocrDirectoryUrl),
    );
    return createOcrIndex(document);
  } catch {
    return null;
  }
}

async function readTargetedCells(): Promise<Map<string, TargetedCellOcr>> {
  try {
    const document = await readJson<{ cells?: TargetedCellOcr[] }>(cellOcrUrl);
    return new Map(
      (document.cells ?? []).map((cell) => [
        `${cell.programCode}:${cell.order}`,
        cell,
      ]),
    );
  } catch {
    return new Map();
  }
}

async function readThresholdOverrides(): Promise<Map<string, number | null>> {
  try {
    const document = await readJson<{
      values?: Record<string, number | null>;
    }>(thresholdOverrideUrl);
    return new Map(Object.entries(document.values ?? {}));
  } catch {
    return new Map();
  }
}

async function readProgramOverrides(): Promise<Map<string, ProgramOverride>> {
  const document = await readJson<{
    academicYear?: number;
    programs?: Record<string, ProgramOverride>;
  }>(programOverrideUrl);
  if (document.academicYear !== 114) {
    throw new Error("官方校系人工覆核檔 academicYear 必須是 114");
  }
  return new Map(Object.entries(document.programs ?? {}));
}

async function writeJsonAtomically(url: URL, value: unknown): Promise<void> {
  const path = fileURLToPath(url);
  await mkdir(new URL("./", url), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

function cropRequestsForProgram(
  schoolId: string,
  programCode: string,
  ruleCount: number,
  index: OcrIndex | null,
  geometry: ImageGeometry | null,
): CropRequest[] {
  if (!index || !geometry || ruleCount === 0) return [];
  const codeWord = index.wordByCode.get(programCode);
  if (!codeWord) return [];
  const centerY = codeWord.boundingBox.y + codeWord.boundingBox.height / 2;
  const edges = screeningColumnEdges(centerY, geometry);
  const row = tableRowBounds(centerY, geometry);
  if (!edges || !row) return [];
  if (ruleCount > edges.columns.length) return [];
  return Array.from({ length: ruleCount }, (_, index) => {
    const column = edges.columns[index]!;
    const left = Math.max(0, Math.floor(column.left + 2));
    const right = Math.min(geometry.width, Math.ceil(column.right - 2));
    const top = Math.max(0, row.top + 2);
    const bottom = Math.min(geometry.height, row.bottom - 2);
    return {
      programCode,
      schoolId,
      order: index + 1,
      imagePath: fileURLToPath(
        new URL(`${programCode}-${index + 1}.png`, cellDirectoryUrl),
      ),
      tailImagePath: fileURLToPath(
        new URL(`${programCode}-${index + 1}-tail.png`, cellDirectoryUrl),
      ),
      left,
      top,
      width: right - left,
      height: bottom - top,
    };
  });
}

async function writeThresholdCellCrops(requests: readonly CropRequest[]): Promise<void> {
  await mkdir(cellDirectoryUrl, { recursive: true });
  for (const request of requests) {
    const sourcePath = fileURLToPath(
      new URL(`${request.schoolId}.png`, imageDirectoryUrl),
    );
    await sharp(sourcePath)
      .extract({
        left: request.left,
        top: request.top,
        width: request.width,
        height: request.height,
      })
      .resize({ width: request.width * 5, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalize()
      .sharpen()
      .png()
      .toFile(request.imagePath);
    const tailLeft = request.left + Math.floor(request.width * 0.48);
    const tailWidth = request.left + request.width - tailLeft;
    await sharp(sourcePath)
      .extract({
        left: tailLeft,
        top: request.top,
        width: tailWidth,
        height: request.height,
      })
      .resize({ width: tailWidth * 9, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalize()
      .sharpen()
      .png()
      .toFile(request.tailImagePath);
  }
  await writeJsonAtomically(new URL("manifest.json", cellDirectoryUrl), {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    cells: requests.map(({ programCode, order, imagePath, tailImagePath }) => ({
      programCode,
      order,
      imagePath,
      tailImagePath,
    })),
  });
}

function assertCatalog(catalog: Catalog): void {
  const uniqueCodes = new Set(catalog.programs.map(({ programCode }) => programCode));
  const uniqueSchools = new Set(catalog.programs.map(({ schoolId }) => schoolId));
  const apcsCount = catalog.programs.filter(
    (program) => program.raw?.requiresApcs === true,
  ).length;
  const artExamCount = catalog.programs.filter((program) => {
    const rawListRow = program.raw?.listRowHtml ?? "";
    const artExamCell = rawListRow.match(
      /title=['"]是否要參加術科考試['"][^>]*>([^]*?)<\/td>/u,
    )?.[1];
    return artExamCell?.includes("是") ?? false;
  }).length;
  const specialFlagsComplete = catalog.programs.every(
    (program) => typeof program.raw?.requiresApcs === "boolean",
  );
  if (
    catalog.academicYear !== 114 ||
    catalog.declaredSchoolCount !== EXPECTED_SCHOOL_COUNT ||
    catalog.declaredProgramCount !== EXPECTED_PROGRAM_COUNT ||
    catalog.programs.length !== EXPECTED_PROGRAM_COUNT ||
    uniqueCodes.size !== EXPECTED_PROGRAM_COUNT ||
    uniqueSchools.size !== EXPECTED_SCHOOL_COUNT ||
    catalog.validation.actualSchoolCount !== EXPECTED_SCHOOL_COUNT ||
    catalog.validation.actualProgramCount !== EXPECTED_PROGRAM_COUNT ||
    catalog.validation.uniqueProgramCodeCount !== EXPECTED_PROGRAM_COUNT ||
    !catalog.validation.schoolCountsMatch ||
    !catalog.validation.totalCountMatches ||
    !catalog.validation.programCodesUnique ||
    !specialFlagsComplete ||
    apcsCount !== EXPECTED_APCS_PROGRAM_COUNT ||
    artExamCount !== EXPECTED_ART_EXAM_PROGRAM_COUNT
  ) {
    throw new Error(
      `官方目錄完整性驗證失敗：schools=${uniqueSchools.size}/${EXPECTED_SCHOOL_COUNT}, ` +
        `programs=${catalog.programs.length}/${EXPECTED_PROGRAM_COUNT}, unique=${uniqueCodes.size}, ` +
        `APCS=${apcsCount}/${EXPECTED_APCS_PROGRAM_COUNT}, ` +
        `術科=${artExamCount}/${EXPECTED_ART_EXAM_PROGRAM_COUNT}。` +
        `若 APCS 欄位缺漏，請先重新執行 data:catalog。`,
    );
  }
}

async function main(): Promise<void> {
  const catalog = await readJson<Catalog>(catalogUrl);
  assertCatalog(catalog);
  const sources = await readJson<SourceIndexEntry[]>(sourceIndexUrl);
  const sourceBySchool = new Map(sources.map((source) => [source.schoolId, source]));
  if (sourceBySchool.size !== EXPECTED_SCHOOL_COUNT) {
    throw new Error(`官方來源索引應有 ${EXPECTED_SCHOOL_COUNT} 所學校`);
  }

  const ocrBySchool = new Map<string, OcrIndex | null>();
  const geometryBySchool = new Map<string, ImageGeometry | null>();
  const targetedCells = await readTargetedCells();
  const thresholdOverrides = await readThresholdOverrides();
  const programOverrides = await readProgramOverrides();
  for (const schoolId of sourceBySchool.keys()) {
    ocrBySchool.set(schoolId, await readOcrIndex(schoolId));
    geometryBySchool.set(schoolId, await readImageGeometry(schoolId));
  }
  for (const schoolId of sourceBySchool.keys()) {
    inferMissingCodeRows(
      catalog.programs.filter((program) => program.schoolId === schoolId),
      ocrBySchool.get(schoolId) ?? null,
    );
  }

  const reviews: ReviewEntry[] = [];
  const cropRequests: CropRequest[] = [];
  const renamedSchoolIds = new Set<string>();
  const programs: Program[] = catalog.programs.map((catalogProgram) => {
    const sourceIndex = sourceBySchool.get(catalogProgram.schoolId);
    if (!sourceIndex) {
      throw new Error(`缺少校碼 ${catalogProgram.schoolId} 的官方來源`);
    }
    if (
      sourceIndex.schoolName !== catalogProgram.schoolName &&
      !renamedSchoolIds.has(catalogProgram.schoolId)
    ) {
      console.warn(
        `校碼 ${catalogProgram.schoolId} 校系頁現名為 ${catalogProgram.schoolName}；` +
          `114 招生資料保留歷史名稱 ${sourceIndex.schoolName}`,
      );
      renamedSchoolIds.add(catalogProgram.schoolId);
    }

    const ruleDerivation = deriveRuleSubjects(catalogProgram.items);
    const requirementDerivation = deriveRequirements(catalogProgram.items);
    const rawListRow = catalogProgram.raw?.listRowHtml ?? "";
    const artExamCell = rawListRow.match(
      /title=['"]是否要參加術科考試['"][^>]*>([^]*?)<\/td>/u,
    )?.[1];
    const requiresArtExam = artExamCell?.includes("是") ?? false;
    const requiresApcs = catalogProgram.raw?.requiresApcs === true;
    const programOverride = programOverrides.get(catalogProgram.programCode);
    const threshold = thresholdScoresForProgram(
      catalogProgram.programCode,
      ruleDerivation.rules,
      ocrBySchool.get(catalogProgram.schoolId) ?? null,
      geometryBySchool.get(catalogProgram.schoolId) ?? null,
      targetedCells,
      thresholdOverrides,
    );
    const hasNoScreeningMultiplier =
      ruleDerivation.rules.length === 0 && ruleDerivation.issues.length === 0;
    const requirementOnly =
      hasNoScreeningMultiplier && requirementDerivation.requirements.length > 0;
    let screeningRules = hasNoScreeningMultiplier
      ? []
      : threshold.scores
        ? makeRules(ruleDerivation.rules, threshold.scores)
        : null;
    const specialScreeningReasons = uniqueStrings([
      ...(requiresArtExam
        ? ["需特殊檢定（術科），詳情請至官方網站查詢"]
        : []),
      ...(requiresApcs
        ? ["需特殊檢定（APCS），詳情請至官方網站查詢"]
        : []),
    ]);
    const ordinaryReviewReasons = uniqueStrings([
      ...ruleDerivation.issues,
      ...requirementDerivation.issues,
      ...(screeningRules !== null && (screeningRules.length > 0 || requirementOnly)
        ? []
        : [
            hasNoScreeningMultiplier
              ? "官方未採學測倍率或檢定，可能使用術科或其他篩選資料"
              : threshold.reason ?? "缺少可信的最低級分",
          ]),
    ]);
    const reasons = programOverride?.reviewReasons
      ? uniqueStrings([
          ...programOverride.reviewReasons,
          ...(SPECIAL_SCREENING_DETAILS_BY_CODE[catalogProgram.programCode] ?? []),
        ])
      : specialScreeningReasons.length > 0
        ? uniqueStrings([
            ...specialScreeningReasons,
            ...(SPECIAL_SCREENING_DETAILS_BY_CODE[catalogProgram.programCode] ?? []),
          ])
        : ordinaryReviewReasons;
    const screeningVariants = programOverride?.screeningVariants ?? [];
    const hasScreeningVariants = screeningVariants.length > 0;
    const supported =
      reasons.length === 0 &&
      screeningRules !== null &&
      (screeningRules.length > 0 || requirementOnly || hasScreeningVariants);
    if (screeningRules === null) screeningRules = [];
    if (specialScreeningReasons.length > 0 || hasScreeningVariants) {
      // 術科／APCS 會插入自己的倍率關卡；只把學測科目依序套到官方
      // 欄位會造成關卡錯位。這些校系仍完整保留供搜尋與連往官方，
      // 但在支援特殊成績型別前，不發布可能誤導的部分 rules[]。
      screeningRules = [];
    }

    if (
      !supported &&
      reasons.some((reason) => reason.startsWith("OCR 無法") || reason.startsWith("OCR 對"))
    ) {
      cropRequests.push(
        ...cropRequestsForProgram(
          catalogProgram.schoolId,
          catalogProgram.programCode,
          ruleDerivation.rules.length,
          ocrBySchool.get(catalogProgram.schoolId) ?? null,
          geometryBySchool.get(catalogProgram.schoolId) ?? null,
        ),
      );
    }

    const source: ProgramSource = {
      collegeListUrl: sourceIndex.collegeListUrl,
      reportHtmlUrl: sourceIndex.reportHtmlUrl,
      reportImageUrl: sourceIndex.reportImageUrl,
      programDetailUrl: catalogProgram.detailUrl,
    };
    const program: Program = {
      year: 114,
      schoolId: catalogProgram.schoolId,
      schoolName: sourceIndex.schoolName,
      programCode: catalogProgram.programCode,
      programName: catalogProgram.programName,
      ...(catalogProgram.quota === null ? {} : { quota: catalogProgram.quota }),
      groupTags: deriveGroupTags(catalogProgram),
      departmentKeywords: [],
      requirements: requirementDerivation.requirements,
      screeningRules: screeningRules ?? [],
      ...(hasScreeningVariants ? { screeningVariants } : {}),
      ...(programOverride?.additionalScreeningRules?.length
        ? { additionalScreeningRules: programOverride.additionalScreeningRules }
        : {}),
      ...(programOverride?.specialScreeningGroups?.length
        ? { specialScreeningGroups: programOverride.specialScreeningGroups }
        : {}),
      source,
      dataStatus: supported ? "complete" : "needs-review",
      evaluationSupport: supported ? "supported" : "unsupported",
      ...(supported ? {} : { reviewReasons: reasons }),
      verified: supported,
    };
    if (!supported) {
      reviews.push({
        schoolId: program.schoolId,
        schoolName: program.schoolName,
        programCode: program.programCode,
        programName: program.programName,
        reasons,
        detailUrl: catalogProgram.detailUrl,
      });
    }
    return program;
  });

  const validation = validatePrograms(programs);
  if (
    !validation.valid ||
    validation.programCount !== EXPECTED_PROGRAM_COUNT ||
    validation.schoolCount !== EXPECTED_SCHOOL_COUNT
  ) {
    const firstErrors = validation.errors
      .slice(0, 20)
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join("\n");
    throw new Error(`合併資料驗證失敗：\n${firstErrors}`);
  }

  const reasonCounts = new Map<string, number>();
  for (const review of reviews) {
    for (const reason of review.reasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }
  await writeJsonAtomically(outputUrl, programs);
  await writeJsonAtomically(reviewUrl, {
    academicYear: 114,
    generatedAt: new Date().toISOString(),
    officialSchoolCount: validation.schoolCount,
    officialProgramCount: validation.programCount,
    supportedCount: validation.supportedCount,
    needsReviewCount: validation.unsupportedCount,
    reasonCounts: Object.fromEntries(
      [...reasonCounts.entries()].sort((left, right) => right[1] - left[1]),
    ),
    programs: reviews,
  });
  await writeThresholdCellCrops(cropRequests);
  console.log(
    `已合併 ${validation.schoolCount} 所、${validation.programCount} 校系；` +
      `可安全判斷 ${validation.supportedCount}；需查官方 ${validation.unsupportedCount}`,
  );
  console.log(`資料：${fileURLToPath(outputUrl)}`);
  console.log(`複核清單：${fileURLToPath(reviewUrl)}`);
  console.log(`待重辨識儲存格：${cropRequests.length}`);
}

const entryUrl = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (entryUrl === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
