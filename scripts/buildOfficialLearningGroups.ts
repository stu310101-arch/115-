import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LEARNING_GROUP_OPTIONS,
  type LearningGroupId,
} from "../lib/learningGroupCatalog.ts";
import type { Program } from "../lib/types.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROGRAMS_PATH = path.join(ROOT, "data", "programs_115.json");
const OUTPUT_PATH = path.join(
  ROOT,
  "data",
  "program_learning_groups_115.json",
);
const RUNTIME_OUTPUT_PATH = path.join(
  ROOT,
  "data",
  "program_learning_group_ids_115.json",
);
const OVERRIDES_PATH = path.join(
  ROOT,
  "data",
  "official_learning_group_overrides_115.json",
);
const MAJOR_LIST_URL = "https://collego.edu.tw/Highschool/MajorList";
const MAJOR_URL =
  "https://collego.edu.tw/Highschool/MajorIntro?current_major_id=";
const RETRIEVED_AT = "2026-07-15";

type OfficialDepartment = {
  departmentId: string;
  schoolId: string;
  schoolName: string;
  departmentName: string;
  learningGroupIds: LearningGroupId[];
  majorIds: string[];
  majorNames: string[];
  officialCrossDomain: boolean;
};

type Override = {
  learningGroupIds: LearningGroupId[];
  reason: string;
  sourceUrl?: string;
};

type Match = {
  kind: string;
  departments: OfficialDepartment[];
};

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]*>/gu, "")
    .replace(/&amp;/gu, "&")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;|&apos;/gu, "'")
    .replace(/&nbsp;/gu, " ")
    .replace(/&#(\d+);/gu, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .trim();
}

function normalizeName(value: string): string {
  return decodeHtml(value)
    .normalize("NFKC")
    .toLocaleLowerCase("zh-Hant")
    .replace(/學士學位學程/gu, "學程")
    .replace(/科學學系/gu, "科學系")
    .replace(/(?<!科)學系/gu, "系")
    .replace(/暨/gu, "與")
    .replace(/[\s\u3000·・‧,，、()（）\-_/．.]+/gu, "");
}

function normalizedParentName(value: string): string | undefined {
  const normalized = normalizeName(value);
  for (const marker of ["系", "學程", "學士班"] as const) {
    const index = normalized.indexOf(marker);
    if (index >= 0) return normalized.slice(0, index + marker.length);
  }
  return undefined;
}

function departmentReferenceNames(value: string): string[] {
  const normalized = normalizeName(value);
  const withoutDepartmentSuffix = normalized.replace(/系$/u, "");
  const aliases = [
    ["中國文學", "中文"],
    ["外國語文", "外文"],
    ["財務金融", "財金"],
    ["企業管理", "企管"],
    ["資訊管理", "資管"],
    ["資訊工程", "資工"],
    ["電機工程", "電機"],
    ["化學工程", "化工"],
    ["應用經濟", "應經"],
    ["社會工作", "社工"],
    ["公共衛生", "公衛"],
    ["醫務管理", "醫管"],
    ["生物科技", "生技"],
    ["生命科學", "生科"],
    ["生物產業傳播與發展", "生傳"],
  ] as const;
  const references = new Set([normalized, withoutDepartmentSuffix]);
  for (const [fullName, alias] of aliases) {
    if (withoutDepartmentSuffix.includes(fullName)) {
      references.add(withoutDepartmentSuffix.replace(fullName, alias));
      references.add(alias);
    }
  }
  return [...references].filter((reference) => reference.length >= 2);
}

function groupKey(department: OfficialDepartment): string {
  return `${[...department.learningGroupIds].sort().join("|")}|cross=${department.officialCrossDomain}`;
}

function pickConsistentMatches(
  candidates: OfficialDepartment[],
): OfficialDepartment[] {
  if (candidates.length === 0) return [];
  const keys = new Set(
    candidates.map((department) => groupKey(department)),
  );
  return keys.size === 1 ? candidates : [];
}

function matchProgram(
  program: Program,
  departmentsBySchool: ReadonlyMap<string, OfficialDepartment[]>,
  allDepartments: readonly OfficialDepartment[],
): Match | undefined {
  const programName = normalizeName(program.programName);
  const schoolDepartments = departmentsBySchool.get(program.schoolId) ?? [];

  const exact = schoolDepartments.filter(
    (department) => normalizeName(department.departmentName) === programName,
  );
  if (exact.length > 0) return { kind: "official-exact", departments: exact };

  const parentCandidates = schoolDepartments
    .filter((department) =>
      programName.includes(normalizeName(department.departmentName)),
    )
    .sort(
      (left, right) =>
        normalizeName(right.departmentName).length -
        normalizeName(left.departmentName).length,
    );
  if (parentCandidates.length > 0) {
    const longest = normalizeName(parentCandidates[0].departmentName).length;
    return {
      kind: "official-parent-department",
      departments: parentCandidates.filter(
        (department) => normalizeName(department.departmentName).length === longest,
      ),
    };
  }

  const renamedCandidates = schoolDepartments
    .filter((department) =>
      normalizeName(department.departmentName).includes(programName),
    )
    .sort(
      (left, right) =>
        normalizeName(left.departmentName).length -
        normalizeName(right.departmentName).length,
    );
  if (renamedCandidates.length > 0) {
    const shortest = normalizeName(renamedCandidates[0].departmentName).length;
    const matches = renamedCandidates.filter(
      (department) => normalizeName(department.departmentName).length === shortest,
    );
    if (pickConsistentMatches(matches).length > 0) {
      return { kind: "official-current-name-extension", departments: matches };
    }
  }

  const globalExact = pickConsistentMatches(
    allDepartments.filter(
      (department) => normalizeName(department.departmentName) === programName,
    ),
  );
  if (globalExact.length > 0) {
    return { kind: "official-same-department-name", departments: globalExact };
  }

  const parentName = normalizedParentName(program.programName);
  if (parentName && parentName !== programName) {
    const globalParentExact = pickConsistentMatches(
      allDepartments.filter(
        (department) => normalizeName(department.departmentName) === parentName,
      ),
    );
    if (globalParentExact.length > 0) {
      return {
        kind: "official-same-parent-department",
        departments: globalParentExact,
      };
    }
  }

  const globalParents = allDepartments
    .filter((department) =>
      programName.includes(normalizeName(department.departmentName)),
    )
    .sort(
      (left, right) =>
        normalizeName(right.departmentName).length -
        normalizeName(left.departmentName).length,
    );
  if (globalParents.length > 0) {
    const longest = normalizeName(globalParents[0].departmentName).length;
    const matches = pickConsistentMatches(
      globalParents.filter(
        (department) => normalizeName(department.departmentName).length === longest,
      ),
    );
    if (matches.length > 0) {
      return { kind: "official-same-parent-name", departments: matches };
    }
  }

  return undefined;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": "admission-115-official-data-review/1.0" },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

async function main() {
  const [programsText, overridesText, majorListHtml] = await Promise.all([
    readFile(PROGRAMS_PATH, "utf8"),
    readFile(OVERRIDES_PATH, "utf8").catch(() => "{}"),
    fetchText(MAJOR_LIST_URL),
  ]);
  const programs = JSON.parse(programsText) as Program[];
  const overrides = JSON.parse(overridesText) as Record<string, Override>;

  const optionByNumber = new Map<
    number,
    (typeof LEARNING_GROUP_OPTIONS)[number]
  >(
    LEARNING_GROUP_OPTIONS.map((option) => [option.collegeFrom, option]),
  );
  const majorGroups = new Map<
    string,
    { name: string; groups: Set<LearningGroupId>; officialCrossDomain: boolean }
  >();
  const linkPattern =
    /current_major_id=(\d+)&amp;collegeFrom=(\d+)[^>]*>([\s\S]*?)<\/a>/gu;
  for (const match of majorListHtml.matchAll(linkPattern)) {
    const option = optionByNumber.get(Number(match[2]));
    const officialCrossDomain = Number(match[2]) === 19;
    if (!option && !officialCrossDomain) continue;
    const major = majorGroups.get(match[1]) ?? {
      name: decodeHtml(match[3]),
      groups: new Set<LearningGroupId>(),
      officialCrossDomain: false,
    };
    if (option) major.groups.add(option.id);
    if (officialCrossDomain) major.officialCrossDomain = true;
    majorGroups.set(match[1], major);
  }
  // ColleGo! 的一般跨學類不列在使用者指定的十八學群清單中，
  // 但仍須抓取其對應校系，避免將官方跨領域誤分類到任一學群。
  majorGroups.set("124", {
    name: "一般跨學類",
    groups: new Set<LearningGroupId>(),
    officialCrossDomain: true,
  });

  const majorIds = [...majorGroups.keys()];
  const rows: Array<{
    majorId: string;
    majorName: string;
    learningGroupIds: LearningGroupId[];
    officialCrossDomain: boolean;
    departmentId: string;
    schoolName: string;
    departmentName: string;
  }> = [];
  let cursor = 0;
  async function worker() {
    while (cursor < majorIds.length) {
      const majorId = majorIds[cursor++];
      const major = majorGroups.get(majorId)!;
      const html = await fetchText(`${MAJOR_URL}${majorId}`);
      const rowPattern =
        /<tr>\s*<td><b>([\s\S]*?)<\/b><\/td>\s*<td>\s*<a href="\/Highschool\/DepartmentIntro\?dept_id=(\d+)"[^>]*>([\s\S]*?)<\/a>/gu;
      for (const match of html.matchAll(rowPattern)) {
        rows.push({
          majorId,
          majorName: major.name,
          learningGroupIds: [...major.groups],
          officialCrossDomain: major.officialCrossDomain,
          departmentId: match[2],
          schoolName: decodeHtml(match[1]),
          departmentName: decodeHtml(match[3]),
        });
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));

  const departmentMap = new Map<
    string,
    OfficialDepartment & { groupSet: Set<LearningGroupId>; majorSet: Set<string> }
  >();
  for (const row of rows) {
    const department = departmentMap.get(row.departmentId) ?? {
      departmentId: row.departmentId,
      schoolId: row.departmentId.slice(0, 3),
      schoolName: row.schoolName,
      departmentName: row.departmentName,
      learningGroupIds: [],
      majorIds: [],
      majorNames: [],
      officialCrossDomain: false,
      groupSet: new Set<LearningGroupId>(),
      majorSet: new Set<string>(),
    };
    row.learningGroupIds.forEach((group) => department.groupSet.add(group));
    if (row.officialCrossDomain) department.officialCrossDomain = true;
    department.majorIds.push(row.majorId);
    department.majorSet.add(row.majorName);
    departmentMap.set(row.departmentId, department);
  }

  const officialDepartments = [...departmentMap.values()].map((department) => ({
    departmentId: department.departmentId,
    schoolId: department.schoolId,
    schoolName: department.schoolName,
    departmentName: department.departmentName,
    learningGroupIds: LEARNING_GROUP_OPTIONS.flatMap(({ id }) =>
      department.groupSet.has(id) ? [id] : [],
    ),
    majorIds: [...new Set(department.majorIds)].sort(
      (left, right) => Number(left) - Number(right),
    ),
    majorNames: [...department.majorSet].sort((left, right) =>
      left.localeCompare(right, "zh-Hant"),
    ),
    officialCrossDomain: department.officialCrossDomain,
  }));
  const departmentsBySchool = new Map<string, OfficialDepartment[]>();
  for (const department of officialDepartments) {
    const departments = departmentsBySchool.get(department.schoolId) ?? [];
    departments.push(department);
    departmentsBySchool.set(department.schoolId, departments);
  }

  const outputPrograms: Record<string, unknown> = {};
  const unresolved: Program[] = [];
  const matchCounts = new Map<string, number>();
  for (const program of programs) {
    const override = overrides[program.programCode];
    if (override) {
      outputPrograms[program.programCode] = {
        learningGroupIds: override.learningGroupIds,
        matchKind: "reviewed-override",
        reason: override.reason,
        sourceUrl: override.sourceUrl ?? program.source.programDetailUrl,
      };
      matchCounts.set(
        "reviewed-override",
        (matchCounts.get("reviewed-override") ?? 0) + 1,
      );
      continue;
    }

    const match = matchProgram(program, departmentsBySchool, officialDepartments);
    if (!match) {
      unresolved.push(program);
      continue;
    }
    const learningGroupIds = LEARNING_GROUP_OPTIONS.flatMap(({ id }) =>
      match.departments.some((department) =>
        department.learningGroupIds.includes(id),
      )
        ? [id]
        : [],
    );
    outputPrograms[program.programCode] = {
      learningGroupIds,
      matchKind: match.kind,
      officialDepartmentIds: match.departments.map(
        ({ departmentId }) => departmentId,
      ),
      officialDepartmentNames: [
        ...new Set(match.departments.map(({ departmentName }) => departmentName)),
      ],
      officialMajorNames: [
        ...new Set(match.departments.flatMap(({ majorNames }) => majorNames)),
      ],
      officialCrossDomain: match.departments.some(
        ({ officialCrossDomain }) => officialCrossDomain,
      ),
      sourceUrl: MAJOR_LIST_URL,
    };
    matchCounts.set(match.kind, (matchCounts.get(match.kind) ?? 0) + 1);
  }

  const detailResolved = new Set<string>();
  let detailCursor = 0;
  async function detailWorker() {
    while (detailCursor < unresolved.length) {
      const program = unresolved[detailCursor++];
      const sourceUrl = program.source.programDetailUrl;
      if (!sourceUrl) continue;
      const html = await fetchText(sourceUrl);
      const relevantText = html
        .split(/\r?\n/gu)
        .filter(
          (line) =>
            line.includes("分發") ||
            (line.includes("名") &&
              (line.includes("學系") || line.includes("學程"))),
        )
        .map(decodeHtml)
        .join(" ");
      const normalizedRelevantText = normalizeName(relevantText);
      const matches = (departmentsBySchool.get(program.schoolId) ?? []).filter(
        (department) =>
          departmentReferenceNames(department.departmentName).some((reference) =>
            normalizedRelevantText.includes(reference),
          ),
      );
      if (matches.length === 0) continue;
      const learningGroupIds = LEARNING_GROUP_OPTIONS.flatMap(({ id }) =>
        matches.some((department) => department.learningGroupIds.includes(id))
          ? [id]
          : [],
      );
      outputPrograms[program.programCode] = {
        learningGroupIds,
        matchKind: "official-program-detail-distribution",
        officialDepartmentIds: matches.map(({ departmentId }) => departmentId),
        officialDepartmentNames: matches.map(
          ({ departmentName }) => departmentName,
        ),
        officialMajorNames: [
          ...new Set(matches.flatMap(({ majorNames }) => majorNames)),
        ],
        officialCrossDomain: matches.some(
          ({ officialCrossDomain }) => officialCrossDomain,
        ),
        sourceUrl,
      };
      detailResolved.add(program.programCode);
      matchCounts.set(
        "official-program-detail-distribution",
        (matchCounts.get("official-program-detail-distribution") ?? 0) + 1,
      );
    }
  }
  await Promise.all(Array.from({ length: 8 }, detailWorker));
  const finalUnresolved = unresolved.filter(
    ({ programCode }) => !detailResolved.has(programCode),
  );

  const output = {
    year: 115,
    source: {
      name: "ColleGo! 大學選才與高中育才輔助系統",
      url: MAJOR_LIST_URL,
      retrievedAt: RETRIEVED_AT,
      note: "依官方十八學群、學類及對應校系建立；招生組別沿用其官方母系分類。",
    },
    learningGroups: LEARNING_GROUP_OPTIONS.map(({ id, label }) => ({ id, label })),
    officialDepartmentCount: officialDepartments.length,
    matchCounts: Object.fromEntries(
      [...matchCounts].sort(([left], [right]) => left.localeCompare(right)),
    ),
    unresolvedPrograms: finalUnresolved.map(
      ({ programCode, schoolName, programName, source }) => ({
        programCode,
        schoolName,
        programName,
        sourceUrl: source.programDetailUrl,
      }),
    ),
    programs: outputPrograms,
  };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  const runtimePrograms = Object.fromEntries(
    Object.entries(outputPrograms).map(([programCode, value]) => [
      programCode,
      (value as { learningGroupIds: LearningGroupId[] }).learningGroupIds,
    ]),
  );
  await writeFile(
    RUNTIME_OUTPUT_PATH,
    `${JSON.stringify(runtimePrograms)}\n`,
    "utf8",
  );
  console.log(
    JSON.stringify(
      {
        officialMajors: majorGroups.size,
        officialDepartments: officialDepartments.length,
        mappedPrograms: Object.keys(outputPrograms).length,
        unresolvedPrograms: finalUnresolved.length,
        matchCounts: output.matchCounts,
      },
      null,
      2,
    ),
  );
  if (finalUnresolved.length > 0) process.exitCode = 2;
}

await main();
