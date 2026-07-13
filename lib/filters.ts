import {
  DEPARTMENT_KEYWORDS,
  type DepartmentKeywordId,
} from "../config/departmentKeywords";
import {
  SCHOOL_GROUPS,
  type SchoolGroupId,
} from "../config/schoolGroups";
import {
  matchesGroupedProgramSelections,
  matchesProgramSelection,
  type GroupedProgramSelections,
  type ProgramSelection,
} from "./programSelection";
import type { Program } from "./types";

export type ProgramGroupTag = Program["groupTags"][number];

export type ProgramFilterCriteria = Readonly<{
  /** 同一欄位內採聯集，例如同時選自然組與社會組會保留任一符合者。 */
  groupTags?: readonly ProgramGroupTag[];
  /** 多個預設學校群組採聯集。 */
  schoolGroupIds?: readonly SchoolGroupId[];
  /** 傳入自訂校碼時，會與預設學校群組取聯集。 */
  customSchoolIds?: readonly string[];
  /** 多個科系快捷採聯集。 */
  departmentKeywordIds?: readonly DepartmentKeywordId[];
  /** 自由文字會再縮小快捷科系結果，兩者都存在時採交集。 */
  freeText?: string;
  /** 新版查詢以 6 碼校系代碼精確選取；未傳入時不限制科系。 */
  programSelection?: ProgramSelection;
  /** 自然組與社會組各自選取後採聯集，重疊校系只保留一次。 */
  groupedProgramSelections?: GroupedProgramSelections;
}>;

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-Hant")
    .replace(/[\s\u3000·・‧,，、()（）\-_/]+/gu, "");
}

function normalizedDepartmentCorpus(program: Program): readonly string[] {
  return [program.programName, ...program.departmentKeywords]
    .filter((value): value is string => typeof value === "string")
    .map(normalizeText)
    .filter(Boolean);
}

function corpusIncludes(corpus: readonly string[], keyword: string): boolean {
  const normalizedKeyword = normalizeText(keyword);
  return (
    normalizedKeyword.length > 0 &&
    corpus.some(
      (entry) =>
        entry.includes(normalizedKeyword) || normalizedKeyword.includes(entry),
    )
  );
}

/** 判斷校系是否符合一個科系快捷選項。 */
export function matchesDepartmentKeyword(
  program: Program,
  keywordId: DepartmentKeywordId,
): boolean {
  const corpus = normalizedDepartmentCorpus(program);
  const aliases = [keywordId, ...DEPARTMENT_KEYWORDS[keywordId]];
  return aliases.some((alias) => corpusIncludes(corpus, alias));
}

/** 回傳某校系符合的快捷選項，方便 UI 顯示，但不暴露 mapping 結構。 */
export function matchedDepartmentKeywords(
  program: Program,
  keywordIds: readonly DepartmentKeywordId[] = Object.keys(
    DEPARTMENT_KEYWORDS,
  ) as DepartmentKeywordId[],
): DepartmentKeywordId[] {
  return keywordIds.filter((keywordId) =>
    matchesDepartmentKeyword(program, keywordId),
  );
}

/** 自由文字只搜尋系名與人工校對的 departmentKeywords。 */
export function matchesDepartmentFreeText(
  program: Program,
  freeText: string,
): boolean {
  const query = normalizeText(freeText);
  if (!query) return true;

  const corpus = normalizedDepartmentCorpus(program);
  if (corpus.some((entry) => entry.includes(query))) return true;

  // 輸入「資工」等快捷名稱時，同樣套用可維護的同義詞 mapping。
  const shortcut = (Object.keys(DEPARTMENT_KEYWORDS) as DepartmentKeywordId[])
    .find((keywordId) => normalizeText(keywordId) === query);
  return shortcut ? matchesDepartmentKeyword(program, shortcut) : false;
}

/** 判斷校系是否位於任一指定的預設／自訂學校集合。 */
export function matchesSchoolSelection(
  program: Pick<Program, "schoolId" | "schoolName">,
  schoolGroupIds: readonly SchoolGroupId[] = [],
  customSchoolIds: readonly string[] = [],
): boolean {
  const hasSelection = schoolGroupIds.length > 0 || customSchoolIds.length > 0;
  if (!hasSelection) return true;

  const normalizedSchoolId = program.schoolId.trim();
  if (customSchoolIds.some((id) => id.trim() === normalizedSchoolId)) {
    return true;
  }

  const selectedGroups = SCHOOL_GROUPS.filter((group) =>
    schoolGroupIds.includes(group.id),
  );
  return selectedGroups.some(
    (group) =>
      group.schoolIds.includes(normalizedSchoolId) ||
      group.schoolNames.includes(program.schoolName),
  );
}

/**
 * 查詢的單筆判斷。不同欄位間採交集；同一欄位內的多選採聯集。
 *
 * 所有官方校系都必須可被搜尋；能否進行分數判斷由
 * `evaluationSupport` 控制，而不是在搜尋階段把待確認校系藏起來。
 */
export function matchesProgramFilters(
  program: Program,
  criteria: ProgramFilterCriteria = {},
): boolean {
  const groupTags = criteria.groupTags ?? [];
  if (
    groupTags.length > 0 &&
    !groupTags.some((tag) => program.groupTags.includes(tag))
  ) {
    return false;
  }

  if (
    !matchesSchoolSelection(
      program,
      criteria.schoolGroupIds,
      criteria.customSchoolIds,
    )
  ) {
    return false;
  }

  const departmentKeywordIds = criteria.departmentKeywordIds ?? [];
  if (
    departmentKeywordIds.length > 0 &&
    !departmentKeywordIds.some((keywordId) =>
      matchesDepartmentKeyword(program, keywordId),
    )
  ) {
    return false;
  }

  if (
    criteria.freeText !== undefined &&
    !matchesDepartmentFreeText(program, criteria.freeText)
  ) {
    return false;
  }

  if (
    criteria.programSelection !== undefined &&
    !matchesProgramSelection(program.programCode, criteria.programSelection)
  ) {
    return false;
  }

  if (
    criteria.groupedProgramSelections !== undefined &&
    !matchesGroupedProgramSelections(
      program,
      criteria.groupedProgramSelections,
    )
  ) {
    return false;
  }

  return true;
}

/** 保留輸入順序，讓排序策略可由結果層明確決定。 */
export function filterPrograms(
  programs: readonly Program[],
  criteria: ProgramFilterCriteria = {},
): Program[] {
  return programs.filter((program) => matchesProgramFilters(program, criteria));
}
