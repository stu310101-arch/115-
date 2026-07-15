export const LEARNING_GROUP_OPTIONS = [
  { id: "information", label: "資訊學群", collegeFrom: 1 },
  { id: "engineering", label: "工程學群", collegeFrom: 2 },
  { id: "math-chemistry", label: "數理化學群", collegeFrom: 3 },
  { id: "health-medicine", label: "醫藥衛生學群", collegeFrom: 4 },
  { id: "life-science", label: "生命科學學群", collegeFrom: 5 },
  { id: "bio-resources", label: "生物資源學群", collegeFrom: 6 },
  { id: "earth-environment", label: "地球環境學群", collegeFrom: 7 },
  { id: "architecture-design", label: "建築設計學群", collegeFrom: 8 },
  { id: "arts", label: "藝術學群", collegeFrom: 9 },
  { id: "social-psychology", label: "社會心理學群", collegeFrom: 10 },
  { id: "mass-communication", label: "大眾傳播學群", collegeFrom: 11 },
  { id: "foreign-languages", label: "外語學群", collegeFrom: 12 },
  {
    id: "literature-history-philosophy",
    label: "文史哲學群",
    collegeFrom: 13,
  },
  { id: "education", label: "教育學群", collegeFrom: 14 },
  { id: "law-politics", label: "法政學群", collegeFrom: 15 },
  { id: "management", label: "管理學群", collegeFrom: 16 },
  { id: "finance-economics", label: "財經學群", collegeFrom: 17 },
  { id: "recreation-sports", label: "遊憩運動學群", collegeFrom: 18 },
] as const;

export type LearningGroupId = (typeof LEARNING_GROUP_OPTIONS)[number]["id"];

const LEARNING_GROUP_IDS = new Set<LearningGroupId>(
  LEARNING_GROUP_OPTIONS.map(({ id }) => id),
);

export function isLearningGroupId(value: string): value is LearningGroupId {
  return LEARNING_GROUP_IDS.has(value as LearningGroupId);
}
