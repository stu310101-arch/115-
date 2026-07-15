import type { GroupTag } from "./types";

export const LEARNING_GROUP_OPTIONS = [
  {
    id: "information",
    label: "資訊學群",
    collegeFrom: 1,
    admissionGroups: ["自然組"],
  },
  {
    id: "engineering",
    label: "工程學群",
    collegeFrom: 2,
    admissionGroups: ["自然組"],
  },
  {
    id: "math-chemistry",
    label: "數理化學群",
    collegeFrom: 3,
    admissionGroups: ["自然組"],
  },
  {
    id: "health-medicine",
    label: "醫藥衛生學群",
    collegeFrom: 4,
    admissionGroups: ["自然組"],
  },
  {
    id: "life-science",
    label: "生命科學學群",
    collegeFrom: 5,
    admissionGroups: ["自然組"],
  },
  {
    id: "bio-resources",
    label: "生物資源學群",
    collegeFrom: 6,
    admissionGroups: ["自然組"],
  },
  {
    id: "earth-environment",
    label: "地球環境學群",
    collegeFrom: 7,
    admissionGroups: ["自然組", "社會組"],
  },
  {
    id: "architecture-design",
    label: "建築設計學群",
    collegeFrom: 8,
    admissionGroups: ["自然組", "社會組"],
  },
  {
    id: "arts",
    label: "藝術學群",
    collegeFrom: 9,
    admissionGroups: ["社會組"],
  },
  {
    id: "social-psychology",
    label: "社會心理學群",
    collegeFrom: 10,
    admissionGroups: ["自然組", "社會組"],
  },
  {
    id: "mass-communication",
    label: "大眾傳播學群",
    collegeFrom: 11,
    admissionGroups: ["社會組"],
  },
  {
    id: "foreign-languages",
    label: "外語學群",
    collegeFrom: 12,
    admissionGroups: ["社會組"],
  },
  {
    id: "literature-history-philosophy",
    label: "文史哲學群",
    collegeFrom: 13,
    admissionGroups: ["社會組"],
  },
  {
    id: "education",
    label: "教育學群",
    collegeFrom: 14,
    admissionGroups: ["自然組", "社會組"],
  },
  {
    id: "law-politics",
    label: "法政學群",
    collegeFrom: 15,
    admissionGroups: ["社會組"],
  },
  {
    id: "management",
    label: "管理學群",
    collegeFrom: 16,
    admissionGroups: ["自然組", "社會組"],
  },
  {
    id: "finance-economics",
    label: "財經學群",
    collegeFrom: 17,
    admissionGroups: ["社會組"],
  },
  {
    id: "recreation-sports",
    label: "遊憩運動學群",
    collegeFrom: 18,
    admissionGroups: ["自然組", "社會組"],
  },
] as const;

export type LearningGroupId = (typeof LEARNING_GROUP_OPTIONS)[number]["id"];

const LEARNING_GROUP_IDS = new Set<LearningGroupId>(
  LEARNING_GROUP_OPTIONS.map(({ id }) => id),
);

export function isLearningGroupId(value: string): value is LearningGroupId {
  return LEARNING_GROUP_IDS.has(value as LearningGroupId);
}

export function learningGroupOptionsForGroups(
  groups: readonly GroupTag[],
): (typeof LEARNING_GROUP_OPTIONS)[number][] {
  if (groups.length === 0) return [];
  return LEARNING_GROUP_OPTIONS.filter((option) =>
    option.admissionGroups.some((group) => groups.includes(group)),
  );
}

export function normalizeLearningGroupIdsForGroups(
  ids: readonly LearningGroupId[],
  groups: readonly GroupTag[],
): LearningGroupId[] {
  const availableIds = new Set(
    learningGroupOptionsForGroups(groups).map(({ id }) => id),
  );
  return [...new Set(ids)].filter((id) => availableIds.has(id));
}
