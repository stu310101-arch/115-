import type { GroupTag, Program } from "./types";
import type { LearningGroupId } from "./learningGroups";
import {
  programTaxonomyFor,
  type AcademicCategoryId,
} from "./admissionTaxonomy";

export const PROGRAM_SELECTION_MODES = [
  "none",
  "all",
  "include",
  "exclude",
] as const;

export type ProgramSelectionMode = (typeof PROGRAM_SELECTION_MODES)[number];

export type ProgramSelection = Readonly<{
  mode: ProgramSelectionMode;
  /**
   * `include` stores selected codes; `exclude` stores the few unchecked codes.
   * `none` and `all` keep this empty so a full group never creates a huge URL.
   */
  codes: readonly string[];
}>;

export type GroupedProgramSelections = Readonly<
  Record<GroupTag, ProgramSelection>
>;

export type ProgramOption = Readonly<{
  programCode: string;
  programName: string;
  schoolId: string;
  schoolName: string;
  groupTags: readonly GroupTag[];
  academicCategoryIds: readonly AcademicCategoryId[];
  learningGroupIds: readonly LearningGroupId[];
}>;

export type DepartmentOption = Readonly<{
  departmentName: string;
  /** 同一學群內所有同名校系的 6 碼代碼；UI 只顯示一次科系名稱。 */
  programCodes: readonly string[];
}>;

function normalizeDepartmentSearch(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-Hant")
    .replace(/[\s\u3000·・‧,，、()（）\-_/]+/gu, "");
}

function departmentMatchScore(name: string, query: string): number | null {
  const exactIndex = name.indexOf(query);
  if (exactIndex >= 0) {
    return exactIndex * 100 + (name.length - query.length);
  }

  let searchFrom = 0;
  let firstIndex = -1;
  let lastIndex = -1;
  for (const character of query) {
    const index = name.indexOf(character, searchFrom);
    if (index < 0) return null;
    if (firstIndex < 0) firstIndex = index;
    lastIndex = index;
    searchFrom = index + character.length;
  }

  const matchSpan = lastIndex - firstIndex + 1;
  const gapCount = matchSpan - query.length;
  const commonAbbreviationBonus =
    query.includes("資工") && name.includes("資訊工程") ? 6_000 : 0;
  return (
    10_000 +
    gapCount * 1_000 +
    firstIndex * 100 +
    name.length -
    commonAbbreviationBonus
  );
}

/**
 * 關鍵字必須逐字、依順序出現在系名中；完全連續命中優先，其次依字距排序。
 * 例如「資工系」可命中「資訊工程學系」，但「牙醫系」不會命中「中醫學系」。
 */
export function rankDepartmentOptions(
  departments: readonly DepartmentOption[],
  rawQuery: string,
): DepartmentOption[] {
  const query = normalizeDepartmentSearch(rawQuery);
  if (!query) return [...departments];

  return departments
    .flatMap((department) => {
      const score = departmentMatchScore(
        normalizeDepartmentSearch(department.departmentName),
        query,
      );
      return score === null ? [] : [{ department, score }];
    })
    .sort(
      (left, right) =>
        left.score - right.score ||
        left.department.departmentName.localeCompare(
          right.department.departmentName,
          "zh-Hant",
        ),
    )
    .map(({ department }) => department);
}

export const EMPTY_PROGRAM_SELECTION: ProgramSelection = {
  mode: "none",
  codes: [],
};

export const EMPTY_GROUPED_PROGRAM_SELECTIONS: GroupedProgramSelections = {
  自然組: EMPTY_PROGRAM_SELECTION,
  社會組: EMPTY_PROGRAM_SELECTION,
};

export function toProgramOptions(
  programs: readonly Program[],
): ProgramOption[] {
  return programs.map((program) => {
    const taxonomy = programTaxonomyFor(program);
    return {
      programCode: program.programCode,
      programName: program.programName,
      schoolId: program.schoolId,
      schoolName: program.schoolName,
      groupTags: taxonomy.groupTags,
      academicCategoryIds: taxonomy.academicCategoryIds,
      learningGroupIds: taxonomy.learningGroupIds,
    };
  });
}

export function toDepartmentOptions(
  programs: readonly ProgramOption[],
  group: GroupTag,
): DepartmentOption[] {
  const codesByName = new Map<string, string[]>();

  programs.forEach((program) => {
    if (!program.groupTags.includes(group)) return;
    const codes = codesByName.get(program.programName) ?? [];
    codes.push(program.programCode);
    codesByName.set(program.programName, codes);
  });

  return [...codesByName.entries()]
    .map(([departmentName, programCodes]) => ({
      departmentName,
      programCodes,
    }))
    .sort((left, right) =>
      left.departmentName.localeCompare(right.departmentName, "zh-Hant"),
    );
}

export function isProgramSelected(
  selection: ProgramSelection,
  programCode: string,
): boolean {
  switch (selection.mode) {
    case "all":
      return true;
    case "include":
      return selection.codes.includes(programCode);
    case "exclude":
      return !selection.codes.includes(programCode);
    default:
      return false;
  }
}

export function selectedProgramCount(
  selection: ProgramSelection,
  availableProgramCodes: readonly string[],
): number {
  const available = new Set(availableProgramCodes);
  const matchingStoredCodes = new Set(
    selection.codes.filter((code) => available.has(code)),
  ).size;

  switch (selection.mode) {
    case "all":
      return available.size;
    case "include":
      return matchingStoredCodes;
    case "exclude":
      return Math.max(0, available.size - matchingStoredCodes);
    default:
      return 0;
  }
}

export function toggleProgramSelection(
  selection: ProgramSelection,
  programCode: string,
): ProgramSelection {
  const codes = new Set(selection.codes);

  if (selection.mode === "all") {
    return { mode: "exclude", codes: [programCode] };
  }

  if (selection.mode === "exclude") {
    if (codes.has(programCode)) codes.delete(programCode);
    else codes.add(programCode);
    return codes.size === 0
      ? { mode: "all", codes: [] }
      : { mode: "exclude", codes: [...codes] };
  }

  if (codes.has(programCode)) codes.delete(programCode);
  else codes.add(programCode);
  return codes.size === 0
    ? EMPTY_PROGRAM_SELECTION
    : { mode: "include", codes: [...codes] };
}

export function areProgramCodesSelected(
  selection: ProgramSelection,
  programCodes: readonly string[],
): boolean {
  return (
    programCodes.length > 0 &&
    programCodes.every((code) => isProgramSelected(selection, code))
  );
}

/** 一次勾選／取消某個科系名稱所涵蓋的所有校系代碼。 */
export function toggleProgramCodes(
  selection: ProgramSelection,
  programCodes: readonly string[],
): ProgramSelection {
  const targetCodes = [...new Set(programCodes)];
  if (targetCodes.length === 0) return selection;

  const storedCodes = new Set(selection.codes);
  const shouldDeselect = areProgramCodesSelected(selection, targetCodes);

  if (shouldDeselect) {
    if (selection.mode === "all" || selection.mode === "exclude") {
      targetCodes.forEach((code) => storedCodes.add(code));
      return { mode: "exclude", codes: [...storedCodes] };
    }
    targetCodes.forEach((code) => storedCodes.delete(code));
    return storedCodes.size === 0
      ? EMPTY_PROGRAM_SELECTION
      : { mode: "include", codes: [...storedCodes] };
  }

  if (selection.mode === "all") return selection;
  if (selection.mode === "exclude") {
    targetCodes.forEach((code) => storedCodes.delete(code));
    return storedCodes.size === 0
      ? { mode: "all", codes: [] }
      : { mode: "exclude", codes: [...storedCodes] };
  }

  targetCodes.forEach((code) => storedCodes.add(code));
  return { mode: "include", codes: [...storedCodes] };
}

export function selectedDepartmentCount(
  selection: ProgramSelection,
  departments: readonly DepartmentOption[],
): number {
  return departments.filter((department) =>
    areProgramCodesSelected(selection, department.programCodes),
  ).length;
}

export function matchesProgramSelection(
  programCode: string,
  selection: ProgramSelection,
): boolean {
  return isProgramSelected(selection, programCode);
}

/** 兩組採聯集；同時存在於兩組的校系只要任一組有選取就算符合。 */
export function matchesGroupedProgramSelections(
  program: Pick<ProgramOption, "programCode" | "groupTags">,
  selections: GroupedProgramSelections,
): boolean {
  return program.groupTags.some((group) =>
    matchesProgramSelection(program.programCode, selections[group]),
  );
}

/** 回傳自然組與社會組選取後的唯一校系代碼，重疊校系不重複計數。 */
export function selectedUniqueProgramCodes(
  programs: readonly ProgramOption[],
  selections: GroupedProgramSelections,
): string[] {
  return programs
    .filter((program) => matchesGroupedProgramSelections(program, selections))
    .map((program) => program.programCode);
}
