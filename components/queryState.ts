import {
  EMPTY_GROUPED_PROGRAM_SELECTIONS,
  PROGRAM_SELECTION_MODES,
  type GroupedProgramSelections,
  type ProgramSelection,
  type ProgramSelectionMode,
} from "../lib/programSelection";
import {
  isSchoolGroupId,
  type SchoolGroupId,
} from "../config/schoolGroups";
import type { ApplicantGender, GroupTag } from "../lib/types";
import {
  isLearningGroupId,
  type LearningGroupId,
} from "../lib/learningGroups";
import {
  isAcademicCategoryId,
  isProgramFilterMethod,
  normalizeAcademicCategoryIdsForGroups,
  type AcademicCategoryId,
  type ProgramFilterMethod,
} from "../lib/admissionTaxonomy";
import {
  SCORE_SUBJECTS,
  type ApcsScoreDraft,
  type ApcsScorePart,
  type ScoreDraft,
} from "./ScoreForm";

export type SiteRoute =
  | "home"
  | "how-it-works"
  | "other-admissions"
  | "query"
  | "results";
export type GroupSelection = GroupTag[];

export type AdmissionQueryState = {
  scores: ScoreDraft;
  apcsScores: ApcsScoreDraft;
  applicantGender: ApplicantGender | "";
  filterMethod: ProgramFilterMethod;
  groupSelection: GroupSelection;
  academicCategoryIds: AcademicCategoryId[];
  schoolGroupIds: SchoolGroupId[];
  customSchoolIds: string[];
  programSelections: GroupedProgramSelections;
  learningGroupIds: LearningGroupId[];
};

export const EMPTY_SCORES: ScoreDraft = {
  國文: "",
  英文: "",
  數A: "",
  數B: "",
  社會: "",
  自然: "",
  英聽: "",
};

export const EXAMPLE_SCORES: ScoreDraft = {
  國文: "12",
  英文: "13",
  數A: "11",
  數B: "10",
  社會: "12",
  自然: "11",
  英聽: "2",
};

export const EMPTY_APCS_SCORES: ApcsScoreDraft = {
  concept: "",
  practice: "",
};

export const DEFAULT_QUERY_STATE: AdmissionQueryState = {
  scores: { ...EMPTY_SCORES },
  apcsScores: { ...EMPTY_APCS_SCORES },
  applicantGender: "",
  filterMethod: "",
  groupSelection: [],
  academicCategoryIds: [],
  schoolGroupIds: [],
  customSchoolIds: [],
  programSelections: EMPTY_GROUPED_PROGRAM_SELECTIONS,
  learningGroupIds: [],
};

const SESSION_KEY = "admission-115-query-v10";
const LEGACY_SESSION_KEYS = [
  { key: "admission-115-query-v9", usesLegacySchoolState: false },
  { key: "admission-115-query-v8", usesLegacySchoolState: false },
  { key: "admission-115-query-v7", usesLegacySchoolState: false },
  { key: "admission-115-query-v6", usesLegacySchoolState: false },
  { key: "admission-115-query-v5", usesLegacySchoolState: false },
  { key: "admission-115-query-v4", usesLegacySchoolState: false },
  { key: "admission-115-query-v3", usesLegacySchoolState: true },
] as const;
const SCHOOL_MODE_PARAM = "schoolMode";
const MULTI_SCHOOL_MODE = "multi";
const APPLICANT_GENDER_PARAM = "gender";
const FILTER_METHOD_PARAM = "filterBy";
const ACADEMIC_CATEGORY_PARAM = "academicCategory";
const LEARNING_GROUP_PARAM = "learningGroup";
const CONFIGURED_BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "")
  .replace(/\/$/, "")
  .replace(/^\/$/, "");
const SCORE_PARAMS = {
  國文: "ch",
  英文: "en",
  數A: "ma",
  數B: "mb",
  社會: "so",
  自然: "na",
  英聽: "li",
} as const;
const APCS_PARAMS: Record<ApcsScorePart, string> = {
  concept: "ac",
  practice: "ap",
};
const PROGRAM_SELECTION_PARAMS = {
  自然組: { mode: "naturalMode", code: "natural" },
  社會組: { mode: "socialMode", code: "social" },
} as const;

function safeScore(
  value: unknown,
  subject: (typeof SCORE_SUBJECTS)[number],
): string {
  if (typeof value !== "string" || value.trim() === "") return "";
  const score = Number(value);
  if (!Number.isFinite(score)) return "";
  const maximum = subject === "英聽" ? 3 : 15;
  return String(Math.max(0, Math.min(maximum, Math.trunc(score))));
}

function safeApcsScore(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") return "";
  const score = Number(value);
  if (!Number.isFinite(score)) return "";
  return String(Math.max(0, Math.min(5, Math.trunc(score))));
}

function safeGroups(value: unknown): GroupSelection {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.filter((item): item is GroupTag =>
    item === "自然組" || item === "社會組",
  ))];
}

function safeApplicantGender(value: unknown): ApplicantGender | "" {
  return value === "male" || value === "female" ? value : "";
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function safeProgramCodes(value: unknown): string[] {
  return safeStringArray(value).filter((code) => /^\d{6}$/.test(code));
}

function safeSchoolIds(value: unknown): string[] {
  return safeStringArray(value).filter((schoolId) => /^\d{3}$/.test(schoolId));
}

function safeSchoolGroupIds(value: unknown): SchoolGroupId[] {
  return safeStringArray(value).filter(isSchoolGroupId);
}

function safeLearningGroupIds(value: unknown): LearningGroupId[] {
  return safeStringArray(value).filter(isLearningGroupId);
}

function safeAcademicCategoryIds(value: unknown): AcademicCategoryId[] {
  return safeStringArray(value).filter(isAcademicCategoryId);
}

function safeProgramFilterMethod(value: unknown): ProgramFilterMethod {
  return typeof value === "string" && isProgramFilterMethod(value)
    ? value
    : "";
}

function inferProgramFilterMethod(
  value: unknown,
  groups: readonly GroupTag[],
  learningGroupIds: readonly LearningGroupId[],
): ProgramFilterMethod {
  const explicit = safeProgramFilterMethod(value);
  if (explicit) return explicit;
  if (learningGroupIds.length > 0) return "learning-groups";
  if (groups.length > 0) return "academic-categories";
  return "";
}

function safeProgramSelection(value: unknown): ProgramSelection {
  if (!value || typeof value !== "object") {
    return { mode: "none", codes: [] };
  }
  const candidate = value as Partial<ProgramSelection>;
  const mode = PROGRAM_SELECTION_MODES.includes(
    candidate.mode as ProgramSelectionMode,
  )
    ? (candidate.mode as ProgramSelectionMode)
    : "none";

  if (mode === "none" || mode === "all") {
    return { mode, codes: [] };
  }

  const codes = safeProgramCodes(candidate.codes);
  return codes.length > 0
    ? { mode, codes }
    : { mode: "none", codes: [] };
}

function safeGroupedProgramSelections(
  value: unknown,
): GroupedProgramSelections {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<GroupedProgramSelections>)
      : {};
  return {
    自然組: safeProgramSelection(candidate.自然組),
    社會組: safeProgramSelection(candidate.社會組),
  };
}

function normalizeStoredState(
  value: unknown,
  legacy = false,
): AdmissionQueryState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AdmissionQueryState> & {
    schoolSelection?: unknown;
  };
  const storedScores = candidate.scores ?? ({} as ScoreDraft);
  const storedApcsScores = candidate.apcsScores ?? ({} as ApcsScoreDraft);
  const storedSchoolGroupIds = safeSchoolGroupIds(candidate.schoolGroupIds);
  const legacySchoolGroupIds = isSchoolGroupId(candidate.schoolSelection)
    ? [candidate.schoolSelection]
    : [];
  const customSchoolIds = safeSchoolIds(candidate.customSchoolIds);
  const storedGroups = safeGroups(candidate.groupSelection);
  const storedLearningGroupIds = safeLearningGroupIds(
    candidate.learningGroupIds,
  );
  const filterMethod = inferProgramFilterMethod(
    candidate.filterMethod,
    storedGroups,
    storedLearningGroupIds,
  );
  const groupSelection =
    filterMethod === "academic-categories" ? storedGroups : [];
  const academicCategoryIds =
    filterMethod === "academic-categories"
      ? normalizeAcademicCategoryIdsForGroups(
          safeAcademicCategoryIds(candidate.academicCategoryIds),
          groupSelection,
        )
      : [];
  const learningGroupIds =
    filterMethod === "learning-groups" ? storedLearningGroupIds : [];

  return {
    scores: SCORE_SUBJECTS.reduce<ScoreDraft>(
      (scores, subject) => ({
        ...scores,
        [subject]: safeScore(storedScores[subject], subject),
      }),
      { ...EMPTY_SCORES },
    ),
    apcsScores: {
      concept: safeApcsScore(storedApcsScores.concept),
      practice: safeApcsScore(storedApcsScores.practice),
    },
    applicantGender: safeApplicantGender(candidate.applicantGender),
    filterMethod,
    groupSelection,
    academicCategoryIds,
    schoolGroupIds:
      !legacy && storedSchoolGroupIds.length > 0
        ? storedSchoolGroupIds
        : legacySchoolGroupIds,
    customSchoolIds:
      !legacy || candidate.schoolSelection === "custom"
        ? customSchoolIds
        : [],
    programSelections: safeGroupedProgramSelections(candidate.programSelections),
    learningGroupIds,
  };
}

export function queryStateFromParams(
  params: URLSearchParams,
): AdmissionQueryState {
  const schoolGroupIds = safeSchoolGroupIds(params.getAll("schoolGroup"));
  const legacySchoolGroup = params.get("school");
  const hasMultiSchoolState =
    params.get(SCHOOL_MODE_PARAM) === MULTI_SCHOOL_MODE ||
    params.has("schoolGroup");
  const customSchoolIds = safeSchoolIds(
    params.get("schoolIds")?.split(",") ?? [],
  );
  const storedGroups = safeGroups(params.getAll("group"));
  const storedLearningGroupIds = safeLearningGroupIds(
    params.getAll(LEARNING_GROUP_PARAM),
  );
  const filterMethod = inferProgramFilterMethod(
    params.get(FILTER_METHOD_PARAM),
    storedGroups,
    storedLearningGroupIds,
  );
  const groupSelection =
    filterMethod === "academic-categories" ? storedGroups : [];
  const academicCategoryIds =
    filterMethod === "academic-categories"
      ? normalizeAcademicCategoryIdsForGroups(
          safeAcademicCategoryIds(params.getAll(ACADEMIC_CATEGORY_PARAM)),
          groupSelection,
        )
      : [];
  const learningGroupIds =
    filterMethod === "learning-groups" ? storedLearningGroupIds : [];
  const programSelections: GroupedProgramSelections = {
    自然組: safeProgramSelection({
      mode: params.get(PROGRAM_SELECTION_PARAMS.自然組.mode),
      codes: params.getAll(PROGRAM_SELECTION_PARAMS.自然組.code),
    }),
    社會組: safeProgramSelection({
      mode: params.get(PROGRAM_SELECTION_PARAMS.社會組.mode),
      codes: params.getAll(PROGRAM_SELECTION_PARAMS.社會組.code),
    }),
  };

  return {
    scores: SCORE_SUBJECTS.reduce<ScoreDraft>(
      (scores, subject) => ({
        ...scores,
        [subject]: safeScore(params.get(SCORE_PARAMS[subject]), subject),
      }),
      { ...EMPTY_SCORES },
    ),
    apcsScores: {
      concept: safeApcsScore(params.get(APCS_PARAMS.concept)),
      practice: safeApcsScore(params.get(APCS_PARAMS.practice)),
    },
    applicantGender: safeApplicantGender(params.get(APPLICANT_GENDER_PARAM)),
    filterMethod,
    groupSelection,
    academicCategoryIds,
    schoolGroupIds:
      hasMultiSchoolState && schoolGroupIds.length > 0
        ? schoolGroupIds
        : isSchoolGroupId(legacySchoolGroup)
          ? [legacySchoolGroup]
          : [],
    customSchoolIds:
      hasMultiSchoolState || legacySchoolGroup === "custom"
        ? customSchoolIds
        : [],
    programSelections,
    learningGroupIds,
  };
}

export function queryStateToParams(state: AdmissionQueryState): URLSearchParams {
  const params = new URLSearchParams();

  SCORE_SUBJECTS.forEach((subject) => {
    const value = safeScore(state.scores[subject], subject);
    if (value !== "") params.set(SCORE_PARAMS[subject], value);
  });
  (Object.keys(APCS_PARAMS) as ApcsScorePart[]).forEach((part) => {
    const value = safeApcsScore(state.apcsScores[part]);
    if (value !== "") params.set(APCS_PARAMS[part], value);
  });
  const applicantGender = safeApplicantGender(state.applicantGender);
  if (applicantGender) params.set(APPLICANT_GENDER_PARAM, applicantGender);
  const filterMethod = safeProgramFilterMethod(state.filterMethod);
  if (filterMethod) params.set(FILTER_METHOD_PARAM, filterMethod);
  if (filterMethod === "academic-categories") {
    const groupSelection = safeGroups(state.groupSelection);
    groupSelection.forEach((group) => params.append("group", group));
    normalizeAcademicCategoryIdsForGroups(
      safeAcademicCategoryIds(state.academicCategoryIds),
      groupSelection,
    ).forEach((id) => params.append(ACADEMIC_CATEGORY_PARAM, id));
  }
  if (filterMethod === "learning-groups") {
    safeLearningGroupIds(state.learningGroupIds).forEach((learningGroupId) => {
      params.append(LEARNING_GROUP_PARAM, learningGroupId);
    });
  }
  const schoolGroupIds = safeSchoolGroupIds(state.schoolGroupIds);
  const customSchoolIds = safeSchoolIds(state.customSchoolIds);
  if (schoolGroupIds.length > 0 || customSchoolIds.length > 0) {
    params.set(SCHOOL_MODE_PARAM, MULTI_SCHOOL_MODE);
  }
  schoolGroupIds.forEach((schoolGroupId) => {
    params.append("schoolGroup", schoolGroupId);
  });
  if (customSchoolIds.length > 0) {
    params.set("schoolIds", customSchoolIds.join(","));
  }
  (["自然組", "社會組"] as const).forEach((group) => {
    const selection = state.programSelections[group];
    const names = PROGRAM_SELECTION_PARAMS[group];
    if (selection.mode === "none") return;
    params.set(names.mode, selection.mode);
    selection.codes.forEach((code) => params.append(names.code, code));
  });

  return params;
}

export function restoreQueryState(): AdmissionQueryState {
  if (typeof window === "undefined") return DEFAULT_QUERY_STATE;

  const params = new URLSearchParams(window.location.search);
  const queryKeys = new Set([
    ...Object.values(SCORE_PARAMS),
    ...Object.values(APCS_PARAMS),
    APPLICANT_GENDER_PARAM,
    FILTER_METHOD_PARAM,
    ACADEMIC_CATEGORY_PARAM,
    LEARNING_GROUP_PARAM,
    "group",
    SCHOOL_MODE_PARAM,
    "schoolGroup",
    "school",
    "schoolIds",
    "naturalMode",
    "natural",
    "socialMode",
    "social",
  ]);
  if ([...params.keys()].some((key) => queryKeys.has(key))) {
    return queryStateFromParams(params);
  }

  try {
    const current = window.sessionStorage.getItem(SESSION_KEY);
    if (current) {
      return normalizeStoredState(JSON.parse(current)) ?? DEFAULT_QUERY_STATE;
    }
    for (const { key, usesLegacySchoolState } of LEGACY_SESSION_KEYS) {
      const legacy = window.sessionStorage.getItem(key);
      if (legacy) {
        return (
          normalizeStoredState(JSON.parse(legacy), usesLegacySchoolState) ??
          DEFAULT_QUERY_STATE
        );
      }
    }
  } catch {
    // Browser storage can be unavailable in privacy modes; URL state still works.
  }

  return DEFAULT_QUERY_STATE;
}

export function saveQueryState(state: AdmissionQueryState): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    // URL parameters remain the cross-page source of truth.
  }
}

export function routePath(route: SiteRoute): string {
  if (typeof window === "undefined") {
    return route === "home"
      ? `${CONFIGURED_BASE_PATH}/`
      : `${CONFIGURED_BASE_PATH}/${route}`;
  }

  const pathname = window.location.pathname;
  const routeSuffix =
    /\/(?:query|results|how-it-works|other-admissions)(?:\/|\.html)?$/;
  const match = pathname.match(routeSuffix);
  const base = match
    ? pathname.slice(0, match.index)
    : pathname.replace(/\/index\.html$/i, "").replace(/\/$/, "");
  return route === "home" ? `${base || ""}/` : `${base || ""}/${route}`;
}
