import { describe, expect, it } from "vitest";
import { SCHOOL_GROUP_IDS } from "../config/schoolGroups";
import {
  filterPrograms,
  matchedDepartmentKeywords,
  matchesDepartmentFreeText,
  matchesProgramFilters,
  matchesSchoolSelection,
} from "../lib/filters";
import type { Program } from "../lib/types";
import { validatePrograms } from "../scripts/validatePrograms";

const SOURCE: Program["source"] = {
  collegeListUrl: "https://www.cac.edu.tw/collegeList.htm",
  reportHtmlUrl: "https://www.cac.edu.tw/report/001.htm",
  reportImageUrl: "https://www.cac.edu.tw/report/pict/001.png",
};

function program(
  overrides: Partial<Program> &
    Pick<Program, "schoolId" | "schoolName" | "programCode" | "programName">,
): Program {
  return {
    year: 114,
    quota: 10,
    groupTags: ["自然組"],
    departmentKeywords: [],
    screeningRules: [
      {
        order: 1,
        label: "英文+自然",
        subjects: ["英文", "自然"],
        minScore: 23,
        rawText: "英文、自然 23",
      },
    ],
    source: SOURCE,
    dataStatus: "complete",
    evaluationSupport: "supported",
    verified: true,
    ...overrides,
  };
}

const programs: Program[] = [
  program({
    schoolId: "001",
    schoolName: "國立臺灣大學",
    programCode: "001012",
    programName: "資訊工程學系",
    departmentKeywords: ["資訊工程", "資工"],
  }),
  program({
    schoolId: "041",
    schoolName: "國立中正大學",
    programCode: "041082",
    programName: "資訊管理學系",
    groupTags: ["自然組", "社會組"],
    departmentKeywords: ["資訊管理"],
  }),
  program({
    schoolId: "099",
    schoolName: "國立臺北大學",
    programCode: "099202",
    programName: "法律學系財經法組",
    groupTags: ["社會組"],
    departmentKeywords: ["法律", "財經法律"],
  }),
  program({
    schoolId: "900",
    schoolName: "測試大學",
    programCode: "900001",
    programName: "電機工程學系",
    departmentKeywords: ["電機工程"],
  }),
  program({
    schoolId: "901",
    schoolName: "尚未校對大學",
    programCode: "901001",
    programName: "資訊工程學系",
    departmentKeywords: ["資訊工程"],
    verified: false,
  }),
];

describe("filterPrograms", () => {
  it("沒有條件時所有官方校系（包含待確認門檻）都可搜尋", () => {
    expect(filterPrograms(programs)).toHaveLength(5);
    expect(filterPrograms(programs).map(({ programCode }) => programCode))
      .toContain("901001");
  });

  it("待確認門檻的校系仍可依科系與組別搜尋", () => {
    expect(
      matchesProgramFilters(programs[4], {
        groupTags: ["自然組"],
        departmentKeywordIds: ["資工"],
      }),
    ).toBe(true);
  });

  it("組別多選採聯集", () => {
    const result = filterPrograms(programs, {
      groupTags: ["自然組", "社會組"],
    });
    expect(result.map(({ programCode }) => programCode)).toEqual([
      "001012",
      "041082",
      "099202",
      "900001",
      "901001",
    ]);
  });

  it("預設學校群組多選與自訂學校採聯集", () => {
    const result = filterPrograms(programs, {
      schoolGroupIds: [SCHOOL_GROUP_IDS.TOP, SCHOOL_GROUP_IDS.CENTRAL],
      customSchoolIds: ["900"],
    });
    expect(result.map(({ schoolId }) => schoolId)).toEqual([
      "001",
      "041",
      "900",
    ]);
  });

  it("師範體系涵蓋師範與教育大學", () => {
    const teacherSchools = [
      ["002", "國立臺灣師範大學"],
      ["022", "國立高雄師範大學"],
      ["023", "國立彰化師範大學"],
      ["031", "國立臺中教育大學"],
      ["032", "國立臺北教育大學"],
    ] as const;

    teacherSchools.forEach(([schoolId, schoolName], index) => {
      expect(
        matchesSchoolSelection(
          program({
            schoolId,
            schoolName,
            programCode: `${schoolId}${String(index + 1).padStart(3, "0")}`,
            programName: "測試學系",
          }),
          [SCHOOL_GROUP_IDS.TEACHER],
        ),
      ).toBe(true);
    });
  });

  it("地名大學可由設定中的校名匹配，不依賴硬編碼校碼", () => {
    expect(
      matchesSchoolSelection(programs[2], [SCHOOL_GROUP_IDS.REGIONAL]),
    ).toBe(true);
  });

  it("科系快捷多選採聯集並套用同義詞 mapping", () => {
    const result = filterPrograms(programs, {
      departmentKeywordIds: ["資工", "電機"],
    });
    expect(result.map(({ programCode }) => programCode)).toEqual([
      "001012",
      "900001",
      "901001",
    ]);
    expect(matchedDepartmentKeywords(programs[0])).toContain("資工");
  });

  it("自由關鍵字可搜尋系名／人工關鍵字，也能使用快捷名稱", () => {
    expect(matchesDepartmentFreeText(programs[2], "財經 法律")).toBe(true);
    expect(matchesDepartmentFreeText(programs[0], "資工")).toBe(true);
    expect(matchesDepartmentFreeText(programs[0], "醫學")).toBe(false);
  });

  it("快捷與自由關鍵字同時存在時採交集", () => {
    expect(
      filterPrograms(programs, {
        departmentKeywordIds: ["法律", "資工"],
        freeText: "財經法律",
      }).map(({ programCode }) => programCode),
    ).toEqual(["099202"]);
  });
});

describe("validatePrograms", () => {
  it("接受名額加總一致且沒有共用門檻的性別分列規則", () => {
    const split = program({
      schoolId: "001",
      schoolName: "國立臺灣大學",
      programCode: "001082",
      programName: "戲劇學系",
      quota: 17,
      screeningRules: [],
      screeningVariants: [
        {
          applicantGender: "male",
          label: "男生組",
          quota: 8,
          screeningRules: [
            { order: 1, label: "國文", subjects: ["國文"], minScore: 12, rawText: "國文12" },
          ],
        },
        {
          applicantGender: "female",
          label: "女生組",
          quota: 9,
          screeningRules: [
            { order: 1, label: "國文", subjects: ["國文"], minScore: 13, rawText: "國文13" },
          ],
        },
      ],
    });

    expect(validatePrograms([split]).valid).toBe(true);
  });

  it("允許資料集保留未校對資料，但明確標示正式篩選會排除", () => {
    const unverified = program({
      schoolId: "777",
      schoolName: "待校對大學",
      programCode: "777001",
      programName: "待校對學系",
      dataStatus: "needs-review",
      evaluationSupport: "unsupported",
      screeningRules: [],
      verified: false,
    });

    const report = validatePrograms([unverified]);
    expect(report.valid).toBe(true);
    expect(report.verifiedCount).toBe(0);
    expect(report.unverifiedCount).toBe(1);
    expect(report.warnings[0]?.message).toContain("仍可搜尋");
  });

  it("一次找出重複校系代碼、空規則、錯誤門檻、缺少來源與 verified 狀態", () => {
    const valid = program({
      schoolId: "001",
      schoolName: "國立臺灣大學",
      programCode: "001012",
      programName: "資訊工程學系",
    });
    const duplicateWithInvalidRule = {
      ...valid,
      screeningRules: [
        {
          ...valid.screeningRules[0],
          minScore: "二十三",
        },
      ],
      source: {
        ...valid.source,
        reportImageUrl: "",
      },
      verified: "yes",
    };
    const emptyRules = {
      ...valid,
      programCode: "001013",
      screeningRules: [],
    };

    const report = validatePrograms([
      valid,
      duplicateWithInvalidRule,
      emptyRules,
    ]);
    const paths = report.errors.map(({ path }) => path);

    expect(report.valid).toBe(false);
    expect(paths).toContain("$[1].programCode");
    expect(paths).toContain("$[1].screeningRules[0].minScore");
    expect(paths).toContain("$[1].source.reportImageUrl");
    expect(paths).toContain("$[1].verified");
    expect(paths).toContain("$[2].screeningRules");
  });
});
