/**
 * 可維護的學校群組設定。
 *
 * `schoolIds` 適合已有穩定校碼的群組；`schoolNames` 則讓地名大學名單不必
 * 猜測或綁死校碼。篩選時兩者任一符合即屬於該群組。
 */
export const SCHOOL_GROUP_IDS = {
  TOP: "top",
  CENTRAL: "central",
  TEACHER: "teacher",
  REGIONAL: "regional",
} as const;

export type SchoolGroupId =
  (typeof SCHOOL_GROUP_IDS)[keyof typeof SCHOOL_GROUP_IDS];

export type SchoolGroup = Readonly<{
  id: SchoolGroupId;
  label: string;
  schoolIds: readonly string[];
  schoolNames: readonly string[];
}>;

export const SCHOOL_GROUPS: readonly SchoolGroup[] = [
  {
    id: SCHOOL_GROUP_IDS.TOP,
    label: "四個頂大",
    schoolIds: ["001", "011", "013", "004"],
    schoolNames: [
      "國立臺灣大學",
      "國立清華大學",
      "國立陽明交通大學",
      "國立成功大學",
    ],
  },
  {
    id: SCHOOL_GROUP_IDS.CENTRAL,
    label: "中字輩",
    schoolIds: ["016", "003", "041", "027"],
    schoolNames: [
      "國立中央大學",
      "國立中興大學",
      "國立中正大學",
      "國立中山大學",
    ],
  },
  {
    id: SCHOOL_GROUP_IDS.TEACHER,
    label: "師範體系",
    schoolIds: ["002", "022", "023", "031", "032"],
    schoolNames: [
      "國立臺灣師範大學",
      "國立高雄師範大學",
      "國立彰化師範大學",
      "國立臺中教育大學",
      "國立臺北教育大學",
    ],
  },
  {
    id: SCHOOL_GROUP_IDS.REGIONAL,
    label: "地名大學",
    schoolIds: ["099", "101", "100", "150", "038", "036", "033", "034"],
    schoolNames: [
      "國立臺北大學",
      "國立高雄大學",
      "國立嘉義大學",
      "國立宜蘭大學",
      "國立臺東大學",
      "國立屏東大學",
      "國立臺南大學",
      "國立東華大學",
    ],
  },
] as const;

/** UI 可直接使用的穩定選項，不必理解群組設定的內部欄位。 */
export const SCHOOL_GROUP_OPTIONS: readonly Readonly<{
  id: SchoolGroupId;
  label: string;
}>[] = SCHOOL_GROUPS.map(({ id, label }) => ({ id, label }));

export function isSchoolGroupId(value: unknown): value is SchoolGroupId {
  return SCHOOL_GROUP_OPTIONS.some((option) => option.id === value);
}
