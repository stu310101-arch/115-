import { describe, expect, it } from "vitest";
import programsJson from "../data/programs_114.json";
import {
  isProgramSelected,
  selectedDepartmentCount,
  selectedUniqueProgramCodes,
  selectedProgramCount,
  toDepartmentOptions,
  toProgramOptions,
  toggleProgramCodes,
  toggleProgramSelection,
} from "../lib/programSelection";
import { filterPrograms } from "../lib/filters";
import type { Program } from "../lib/types";
import {
  DEFAULT_QUERY_STATE,
  EXAMPLE_SCORES,
  queryStateFromParams,
  queryStateToParams,
} from "../components/queryState";

const programs = programsJson as Program[];

describe("114 官方校系選取資料", () => {
  it("完整保留 2,168 個唯一 6 碼校系代碼與兩組清單", () => {
    const options = toProgramOptions(programs);
    const codes = new Set(options.map((program) => program.programCode));
    const schools = new Set(options.map((program) => program.schoolId));
    const natural = options.filter((program) =>
      program.groupTags.includes("自然組"),
    );
    const social = options.filter((program) =>
      program.groupTags.includes("社會組"),
    );

    expect(options).toHaveLength(2168);
    expect(codes.size).toBe(2168);
    expect(schools.size).toBe(66);
    expect([...codes].every((code) => /^\d{6}$/.test(code))).toBe(true);
    expect(natural).toHaveLength(1280);
    expect(social).toHaveLength(1287);
  });

  it("長庚大學 27 個校系均可進入選取清單", () => {
    const changGung = toProgramOptions(programs).filter(
      (program) => program.schoolName === "長庚大學",
    );

    expect(changGung).toHaveLength(27);
    expect(changGung.every((program) => program.programCode.startsWith("030")))
      .toBe(true);
    expect(changGung.map((program) => program.programName)).toContain("醫學系");
  });

  it("兩組可分開全選；兩組同時全選時重疊校系只算一次", () => {
    const options = toProgramOptions(programs);
    const naturalOnly = selectedUniqueProgramCodes(options, {
      自然組: { mode: "all", codes: [] },
      社會組: { mode: "none", codes: [] },
    });
    const bothGroups = selectedUniqueProgramCodes(options, {
      自然組: { mode: "all", codes: [] },
      社會組: { mode: "all", codes: [] },
    });

    expect(naturalOnly).toHaveLength(1280);
    expect(bothGroups).toHaveLength(2168);
    expect(new Set(bothGroups).size).toBe(2168);
  });

  it("科系選單只列去重後的科系名稱，不重複顯示學校", () => {
    const options = toProgramOptions(programs);
    const naturalDepartments = toDepartmentOptions(options, "自然組");
    const socialDepartments = toDepartmentOptions(options, "社會組");
    const computerScience = naturalDepartments.find(
      (department) => department.departmentName === "資訊工程學系",
    );

    expect(naturalDepartments).toHaveLength(853);
    expect(socialDepartments).toHaveLength(934);
    expect(computerScience?.programCodes).toHaveLength(30);
    expect(
      naturalDepartments.every(
        (department) => !("schoolName" in department),
      ),
    ).toBe(true);
  });

  it("中正大學數學系數 A 官方最低篩選級分固定為 11", () => {
    const mathematics = programs.find(
      (program) => program.programCode === "041052",
    );
    const mathARule = mathematics?.screeningRules.find(
      (rule) => rule.label === "數A",
    );

    expect(mathematics?.schoolName).toBe("國立中正大學");
    expect(mathARule).toMatchObject({
      order: 3,
      subjects: ["數A"],
      minScore: 11,
      rawText: "數A11",
    });
  });

  it("全表複驗發現的 12 個官方門檻均已校正", () => {
    const correctedRuleScores = [
      ["001112", 1, 11],
      ["002222", 2, 11],
      ["003132", 2, 11],
      ["004242", 2, 11],
      ["006392", 1, 11],
      ["007012", 2, 11],
      ["011262", 1, 53],
      ["011292", 2, 52],
      ["013132", 2, 51],
      ["013442", 2, 58],
      ["027182", 3, 11],
      ["109012", 1, 57],
    ] as const;

    correctedRuleScores.forEach(([programCode, order, minScore]) => {
      const program = programs.find(
        (candidate) => candidate.programCode === programCode,
      );
      expect(program?.screeningRules.find((rule) => rule.order === order))
        .toMatchObject({ order, minScore });
    });
  });

  it("臺大戲劇保留男、女生分列名額與兩套官方門檻", () => {
    const theatre = programs.find(
      (program) => program.programCode === "001082",
    );

    expect(theatre).toMatchObject({
      quota: 17,
      screeningRules: [],
      evaluationSupport: "supported",
    });
    expect(theatre?.screeningVariants).toEqual([
      expect.objectContaining({
        applicantGender: "male",
        label: "男生組",
        quota: 8,
        screeningRules: expect.arrayContaining([
          expect.objectContaining({ order: 3, minScore: 41 }),
          expect.objectContaining({ order: 4, minScore: 12 }),
          expect.objectContaining({ order: 5, minScore: 13 }),
        ]),
      }),
      expect.objectContaining({
        applicantGender: "female",
        label: "女生組",
        quota: 9,
        screeningRules: expect.arrayContaining([
          expect.objectContaining({ order: 3, minScore: 45 }),
          expect.objectContaining({ order: 4, minScore: 13 }),
          expect.objectContaining({ order: 5, minScore: 14 }),
        ]),
      }),
    ]);
  });

  it("臺大資工 APCS 組明列數學A與實作題特殊門檻", () => {
    const apcs = programs.find(
      (program) => program.programCode === "001602",
    );

    expect(apcs).toMatchObject({
      evaluationSupport: "unsupported",
      screeningRules: [],
      additionalScreeningRules: [
        { label: "數學A", minScore: 12, rawText: "數學A12" },
        { label: "APCS 實作題", minScore: 5, rawText: "APCS 實作題5" },
      ],
    });
  });

  it("APCS 與術科校系不發布可能錯位的部分學測規則", () => {
    ["004522", "056182"].forEach((programCode) => {
      const program = programs.find(
        (candidate) => candidate.programCode === programCode,
      );
      expect(program).toMatchObject({
        programCode,
        evaluationSupport: "unsupported",
        screeningRules: [],
      });
      expect(program?.source.reportImageUrl).toMatch(/^https:\/\//u);
      expect(program?.reviewReasons).toEqual([
        expect.stringMatching(
          /^需特殊檢定（(?:APCS|術科)），詳情請至官方網站查詢$/u,
        ),
      ]);
    });
  });

  it("全數 APCS 與術科校系均標示需特殊檢定並停止自動判斷", () => {
    const apcsProgramsWithoutApcsInName = [
      "013092",
      "016252",
      "033152",
      "058102",
      "101132",
      "150172",
      "153112",
    ];
    const expectedApcsPrograms = programs.filter(
      (program) =>
        /APCS/iu.test(program.programName) ||
        apcsProgramsWithoutApcsInName.includes(program.programCode),
    );
    const specialPrograms = programs.filter((program) =>
      program.reviewReasons?.some((reason) =>
        reason.startsWith("需特殊檢定"),
      ),
    );
    const apcsPrograms = specialPrograms.filter((program) =>
      program.reviewReasons?.some((reason) => reason.includes("（APCS）")),
    );
    const artPrograms = specialPrograms.filter((program) =>
      program.reviewReasons?.some((reason) => reason.includes("（術科）")),
    );

    expect(expectedApcsPrograms).toHaveLength(60);
    expect(specialPrograms).toHaveLength(130);
    expect(apcsPrograms).toHaveLength(60);
    expect(artPrograms).toHaveLength(70);
    specialPrograms.forEach((program) => {
      expect(program.evaluationSupport).toBe("unsupported");
      expect(program.screeningRules).toEqual([]);
      expect(program.reviewReasons?.[0]).toMatch(
        /^需特殊檢定（(?:APCS|術科)），詳情請至官方網站查詢$/u,
      );
    });
    expectedApcsPrograms.forEach((program) => {
      expect(specialPrograms).toContain(program);
    });
  });

  it("完整保留臺師大 8 筆特殊門檻與音樂系分流名額說明", () => {
    const expectedRules = {
      "002282": [["英文", 8], ["數學A", 10], ["APCS 觀念題＋實作題", 7]],
      "002472": [["國文＋英文", 34], ["素描＋彩繪技法＋創意表現", 213]],
      "002482": [["國文＋英文", 28], ["彩繪技法", 72], ["素描", 75]],
      "002492": [["國文＋英文", 26], ["彩繪技法", 69], ["素描", 69], ["水墨書畫", 79.8]],
      "002502": [["體育百分等級", 75.36], ["國文＋英文", 30]],
      "002512": [["體育百分等級", 75.3], ["國文＋英文", 37]],
      "002522": [["體育百分等級", 82.7], ["國文＋英文", 43]],
    } as const;

    Object.entries(expectedRules).forEach(([programCode, rules]) => {
      const program = programs.find(
        (candidate) => candidate.programCode === programCode,
      );
      expect(program).toMatchObject({
        programCode,
        evaluationSupport: "unsupported",
        screeningRules: [],
      });
      expect(
        program?.additionalScreeningRules?.map(({ label, minScore }) => [
          label,
          minScore,
        ]),
      ).toEqual(rules);
    });

    const music = programs.find(
      (program) => program.programCode === "002452",
    );
    expect(music).toMatchObject({ quota: 64, evaluationSupport: "unsupported" });
    expect(music?.reviewReasons?.join("；")).toContain("19 種主修樂器名額加總");
    expect(music?.reviewReasons?.join("；")).toContain("名額與術科最低分不同");
  });

  it("完整保留東吳與政大 3 筆特殊篩選門檻", () => {
    const expectedApcsRules = {
      "005222": [
        ["APCS 觀念題＋實作題", 4],
        ["英文＋數學B", 12],
      ],
      "006422": [
        ["數學A＋自然", 20],
        ["APCS 實作題", 3],
      ],
    } as const;

    Object.entries(expectedApcsRules).forEach(([programCode, rules]) => {
      const program = programs.find(
        (candidate) => candidate.programCode === programCode,
      );
      expect(program).toMatchObject({
        programCode,
        evaluationSupport: "unsupported",
        screeningRules: [],
      });
      expect(
        program?.additionalScreeningRules?.map(({ label, minScore }) => [
          label,
          minScore,
        ]),
      ).toEqual(rules);
    });

    const music = programs.find(
      (program) => program.programCode === "005242",
    );
    expect(music).toMatchObject({
      programCode: "005242",
      quota: 48,
      evaluationSupport: "unsupported",
      screeningRules: [],
    });
    expect(
      music?.additionalScreeningRules?.map(({ label, minScore }) => [
        label,
        minScore,
      ]),
    ).toEqual([
      ["鋼琴主修（10 名）", 80],
      ["聲樂主修（5 名）", 83],
      ["小提琴主修（7 名）", 82.07],
      ["中提琴主修（3 名）", 83.73],
      ["大提琴主修（5 名）", 82],
      ["低音提琴主修（1 名）", 82.79],
      ["長號主修（1 名）", 84.33],
      ["小號主修（1 名）", 86.22],
      ["法國號主修（2 名）", 84],
      ["上低音號主修（1 名）", 86.89],
      ["低音號主修（1 名）", 87.56],
      ["薩克斯管主修（1 名）", 87],
      ["長笛主修（2 名）", 85],
      ["單簧管（豎笛）主修（2 名）", 84.22],
      ["雙簧管主修（1 名）", 86.78],
      ["低音管主修（1 名）", 85.22],
      ["擊樂主修（2 名）", 85.2],
      ["理論作曲主修（2 名）", 82.6],
    ]);
  });
});

describe("programSelection", () => {
  const codes = ["001012", "041082", "099202"];

  it("預設不選，單筆勾選與取消使用 include 模式", () => {
    const selected = toggleProgramSelection(
      { mode: "none", codes: [] },
      "041082",
    );
    expect(selected).toEqual({ mode: "include", codes: ["041082"] });
    expect(isProgramSelected(selected, "041082")).toBe(true);
    expect(selectedProgramCount(selected, codes)).toBe(1);
    expect(toggleProgramSelection(selected, "041082")).toEqual({
      mode: "none",
      codes: [],
    });
  });

  it("全選後只記錄取消勾選的少數代碼", () => {
    const exceptOne = toggleProgramSelection(
      { mode: "all", codes: [] },
      "099202",
    );
    expect(exceptOne).toEqual({ mode: "exclude", codes: ["099202"] });
    expect(selectedProgramCount(exceptOne, codes)).toBe(2);
    expect(isProgramSelected(exceptOne, "099202")).toBe(false);
  });

  it("勾選一個科系名稱會選取該組所有學校的同名校系", () => {
    const naturalDepartments = toDepartmentOptions(
      toProgramOptions(programs),
      "自然組",
    );
    const computerScience = naturalDepartments.find(
      (department) => department.departmentName === "資訊工程學系",
    );
    if (!computerScience) throw new Error("測試資料缺少資訊工程學系");

    const selection = toggleProgramCodes(
      { mode: "none", codes: [] },
      computerScience.programCodes,
    );
    expect(selection.mode).toBe("include");
    expect(selection.codes).toHaveLength(30);
    expect(selectedDepartmentCount(selection, naturalDepartments)).toBe(1);

    const selectedPrograms = filterPrograms(programs, {
      groupedProgramSelections: {
        自然組: selection,
        社會組: { mode: "none", codes: [] },
      },
    });
    expect(selectedPrograms).toHaveLength(30);
    expect(
      selectedPrograms.every(
        (program) => program.programName === "資訊工程學系",
      ),
    ).toBe(true);

    expect(
      toggleProgramCodes(selection, computerScience.programCodes),
    ).toEqual({ mode: "none", codes: [] });

    const excluded = toggleProgramCodes(
      { mode: "all", codes: [] },
      computerScience.programCodes,
    );
    expect(excluded.mode).toBe("exclude");
    expect(excluded.codes).toHaveLength(30);

    const completedFromPartial = toggleProgramCodes(
      { mode: "include", codes: [computerScience.programCodes[0]] },
      computerScience.programCodes,
    );
    expect(completedFromPartial.mode).toBe("include");
    expect(completedFromPartial.codes).toHaveLength(30);
  });

  it("結果篩選精確使用校系代碼", () => {
    const selected = filterPrograms(programs, {
      programSelection: {
        mode: "include",
        codes: ["030012", "030272"],
      },
    });
    expect(selected.map((program) => program.programCode)).toEqual([
      "030012",
      "030272",
    ]);
    expect(
      filterPrograms(programs, {
        programSelection: { mode: "none", codes: [] },
      }),
    ).toHaveLength(0);
  });

  it("自然組與社會組各自選取後採聯集，重疊校系不重複", () => {
    const selected = filterPrograms(programs, {
      groupedProgramSelections: {
        自然組: { mode: "include", codes: ["030042", "030012"] },
        社會組: { mode: "include", codes: ["030042", "099202"] },
      },
    });

    expect(selected.map((program) => program.programCode)).toEqual([
      "030012",
      "030042",
      "099202",
    ]);
  });
});

describe("科系選取網址狀態", () => {
  it("include 模式可完整往返，並拒絕非 6 碼代碼", () => {
    const params = queryStateToParams({
      ...DEFAULT_QUERY_STATE,
      scores: EXAMPLE_SCORES,
      groupSelection: "自然組",
      programSelections: {
        自然組: {
          mode: "include",
          codes: ["030012", "030022", "bad-code"],
        },
        社會組: { mode: "none", codes: [] },
      },
    });
    const restored = queryStateFromParams(params);

    expect(restored.groupSelection).toBe("自然組");
    expect(restored.programSelections.自然組).toEqual({
      mode: "include",
      codes: ["030012", "030022"],
    });
    expect(restored.programSelections.社會組).toEqual({
      mode: "none",
      codes: [],
    });
    expect(restored.scores).toEqual(EXAMPLE_SCORES);
  });

  it("兩組全選各自只傳模式，不在網址列展開上千個代碼", () => {
    const params = queryStateToParams({
      ...DEFAULT_QUERY_STATE,
      groupSelection: "社會組",
      programSelections: {
        自然組: { mode: "all", codes: [] },
        社會組: { mode: "all", codes: [] },
      },
    });

    expect(params.get("naturalMode")).toBe("all");
    expect(params.get("socialMode")).toBe("all");
    expect(params.getAll("natural")).toEqual([]);
    expect(params.getAll("social")).toEqual([]);
  });
});
