import type { ProgramOption } from "./programSelection";
import type { GroupTag, Program } from "./types";
import {
  learningGroupIdsFor,
  type LearningGroupId,
} from "./learningGroups";

export const PROGRAM_FILTER_METHODS = [
  "academic-categories",
  "learning-groups",
] as const;

export type ProgramFilterMethod =
  | ""
  | (typeof PROGRAM_FILTER_METHODS)[number];

export const ACADEMIC_CATEGORY_OPTIONS = [
  {
    id: "social-humanities",
    label: "社會人文",
    admissionGroup: "社會組",
    learningGroupIds: [
      "arts",
      "social-psychology",
      "mass-communication",
      "foreign-languages",
      "literature-history-philosophy",
      "education",
      "law-politics",
    ],
  },
  {
    id: "finance-management",
    label: "財經商管",
    admissionGroup: "社會組",
    learningGroupIds: [
      "management",
      "finance-economics",
      "recreation-sports",
    ],
  },
  {
    id: "engineering-information",
    label: "理工資訊",
    admissionGroup: "自然組",
    learningGroupIds: [
      "information",
      "engineering",
      "math-chemistry",
      "earth-environment",
      "architecture-design",
    ],
  },
  {
    id: "bio-medical-agriculture",
    label: "生物醫農",
    admissionGroup: "自然組",
    learningGroupIds: [
      "health-medicine",
      "life-science",
      "bio-resources",
    ],
  },
] as const satisfies readonly {
  id: string;
  label: string;
  admissionGroup: GroupTag;
  learningGroupIds: readonly LearningGroupId[];
}[];

export type AcademicCategoryId =
  (typeof ACADEMIC_CATEGORY_OPTIONS)[number]["id"];

const ACADEMIC_CATEGORY_IDS = new Set<AcademicCategoryId>(
  ACADEMIC_CATEGORY_OPTIONS.map(({ id }) => id),
);

export function isAcademicCategoryId(
  value: string,
): value is AcademicCategoryId {
  return ACADEMIC_CATEGORY_IDS.has(value as AcademicCategoryId);
}

export function isProgramFilterMethod(
  value: string,
): value is Exclude<ProgramFilterMethod, ""> {
  return PROGRAM_FILTER_METHODS.includes(
    value as (typeof PROGRAM_FILTER_METHODS)[number],
  );
}

export function academicCategoryOptionsForGroups(
  groups: readonly GroupTag[],
): (typeof ACADEMIC_CATEGORY_OPTIONS)[number][] {
  return ACADEMIC_CATEGORY_OPTIONS.filter((option) =>
    groups.includes(option.admissionGroup),
  );
}

export function normalizeAcademicCategoryIdsForGroups(
  ids: readonly AcademicCategoryId[],
  groups: readonly GroupTag[],
): AcademicCategoryId[] {
  const available = new Set(
    academicCategoryOptionsForGroups(groups).map(({ id }) => id),
  );
  return [...new Set(ids)].filter((id) => available.has(id));
}

export function academicCategoryIdsForLearningGroupIds(
  learningGroupIds: readonly LearningGroupId[],
): AcademicCategoryId[] {
  return ACADEMIC_CATEGORY_OPTIONS.filter((option) =>
    option.learningGroupIds.some((id) => learningGroupIds.includes(id)),
  ).map(({ id }) => id);
}

export function admissionGroupTagsForCategoryIds(
  categoryIds: readonly AcademicCategoryId[],
): GroupTag[] {
  return [
    ...new Set(
      ACADEMIC_CATEGORY_OPTIONS.filter((option) =>
        categoryIds.includes(option.id),
      ).map(({ admissionGroup }) => admissionGroup),
    ),
  ];
}

export function admissionGroupTagsForLearningGroupIds(
  learningGroupIds: readonly LearningGroupId[],
): GroupTag[] {
  return admissionGroupTagsForCategoryIds(
    academicCategoryIdsForLearningGroupIds(learningGroupIds),
  );
}

export type ProgramTaxonomy = Readonly<{
  learningGroupIds: readonly LearningGroupId[];
  academicCategoryIds: readonly AcademicCategoryId[];
  groupTags: readonly GroupTag[];
  usesOfficialAdmissionFallback: boolean;
}>;

/**
 * 十八學群與校系對應取自 ColleGo! 官方資料；四大類與自然／社會組由
 * 十八學群穩定映射。官方未歸入十八學群的不分系／跨領域校系，僅在
 * 類組篩選時沿用 115 招生資料的官方採計組別，不替它虛構十八學群。
 */
export function programTaxonomyFor(
  program: Pick<Program, "programCode" | "groupTags">,
): ProgramTaxonomy {
  const learningGroupIds = learningGroupIdsFor(program);
  const academicCategoryIds =
    academicCategoryIdsForLearningGroupIds(learningGroupIds);
  const mappedGroups = admissionGroupTagsForCategoryIds(academicCategoryIds);
  return {
    learningGroupIds,
    academicCategoryIds,
    groupTags:
      mappedGroups.length > 0 ? mappedGroups : [...program.groupTags],
    usesOfficialAdmissionFallback: mappedGroups.length === 0,
  };
}

export type TaxonomySelection = Readonly<{
  filterMethod: ProgramFilterMethod;
  groupSelection: readonly GroupTag[];
  academicCategoryIds: readonly AcademicCategoryId[];
  learningGroupIds: readonly LearningGroupId[];
}>;

export function activeAdmissionGroupsForSelection(
  selection: TaxonomySelection,
): GroupTag[] {
  if (selection.filterMethod === "academic-categories") {
    if (selection.academicCategoryIds.length > 0) {
      return admissionGroupTagsForCategoryIds(selection.academicCategoryIds);
    }
    return [...selection.groupSelection];
  }
  if (selection.filterMethod === "learning-groups") {
    return admissionGroupTagsForLearningGroupIds(selection.learningGroupIds);
  }
  return [];
}

export function matchesProgramTaxonomySelection(
  program: Pick<
    ProgramOption,
    "groupTags" | "academicCategoryIds" | "learningGroupIds"
  >,
  selection: TaxonomySelection,
): boolean {
  if (selection.filterMethod === "academic-categories") {
    if (selection.groupSelection.length === 0) return false;
    if (
      !selection.groupSelection.some((group) =>
        program.groupTags.includes(group),
      )
    ) {
      return false;
    }
    return (
      selection.academicCategoryIds.length === 0 ||
      selection.academicCategoryIds.some((id) =>
        program.academicCategoryIds.includes(id),
      )
    );
  }

  if (selection.filterMethod === "learning-groups") {
    return (
      selection.learningGroupIds.length > 0 &&
      selection.learningGroupIds.some((id) =>
        program.learningGroupIds.includes(id),
      )
    );
  }

  return false;
}
