import { describe, expect, it } from "vitest";
import programsJson from "../data/programs_115.json";
import learningGroupsJson from "../data/program_learning_groups_115.json";
import { LEARNING_GROUP_OPTIONS } from "../lib/learningGroups";
import { ACADEMIC_CATEGORY_OPTIONS } from "../lib/admissionTaxonomy";
import {
  isProgramSelected,
  rankDepartmentOptions,
  selectedDepartmentCount,
  selectedUniqueProgramCodes,
  selectedProgramCount,
  toDepartmentOptions,
  toProgramOptions,
  toggleProgramCodes,
  toggleProgramSelection,
  type ProgramSelection,
} from "../lib/programSelection";
import { filterPrograms } from "../lib/filters";
import {
  evaluateAcademicCriteria,
  supportsAcademicPartialEvaluation,
  supportsProgramEvaluation,
} from "../lib/admission";
import type { Program } from "../lib/types";
import {
  DEFAULT_QUERY_STATE,
  EXAMPLE_SCORES,
  queryStateFromParams,
  queryStateToParams,
} from "../components/queryState";

const programs = programsJson as Program[];

describe("115 官方校系選取資料", () => {
  it("完整保留 2,206 個唯一 6 碼校系代碼與 64 所大學", () => {
    const options = toProgramOptions(programs);
    const codes = new Set(options.map((program) => program.programCode));
    const schools = new Set(options.map((program) => program.schoolId));
    const natural = options.filter((program) =>
      program.groupTags.includes("自然組"),
    );
    const social = options.filter((program) =>
      program.groupTags.includes("社會組"),
    );

    expect(options).toHaveLength(2206);
    expect(codes.size).toBe(2206);
    expect(schools.size).toBe(64);
    expect([...codes].every((code) => /^\d{6}$/.test(code))).toBe(true);
    expect(natural).toHaveLength(1233);
    expect(social).toHaveLength(1237);
    expect(Object.keys(learningGroupsJson.programs)).toHaveLength(2206);
    expect(learningGroupsJson.unresolvedPrograms).toEqual([]);
    expect(LEARNING_GROUP_OPTIONS).toHaveLength(18);
    LEARNING_GROUP_OPTIONS.forEach(({ id }) => {
      expect(
        options.some((program) => program.learningGroupIds.includes(id)),
      ).toBe(true);
    });
  });

  it("所有校系均改用 115 官方來源，長庚大學 30 個校系皆可選取", () => {
    const changGung = toProgramOptions(programs).filter(
      (program) => program.schoolName === "長庚大學",
    );

    expect(programs.every((program) => program.year === 115)).toBe(true);
    expect(
      programs.every((program) =>
        program.source.collegeListUrl.includes("apply115"),
      ),
    ).toBe(true);
    expect(changGung).toHaveLength(30);
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

    expect(naturalOnly).toHaveLength(1233);
    expect(bothGroups).toHaveLength(2206);
    expect(new Set(bothGroups).size).toBe(2206);
  });

  it("科系選單保留 115 去重結果與官方十八學群分類", () => {
    const options = toProgramOptions(programs);
    const naturalDepartments = toDepartmentOptions(options, "自然組");
    const socialDepartments = toDepartmentOptions(options, "社會組");
    const computerScience = naturalDepartments.find(
      (department) => department.departmentName === "資訊工程學系",
    );
    const mappedLearningGroupIds = ACADEMIC_CATEGORY_OPTIONS.flatMap(
      ({ learningGroupIds }) => learningGroupIds,
    );

    expect(naturalDepartments).toHaveLength(831);
    expect(socialDepartments).toHaveLength(886);
    expect(computerScience?.programCodes).toHaveLength(32);
    expect(ACADEMIC_CATEGORY_OPTIONS).toHaveLength(4);
    expect(mappedLearningGroupIds).toHaveLength(18);
    expect(new Set(mappedLearningGroupIds).size).toBe(18);
    expect(options.filter((program) => program.learningGroupIds.length === 0))
      .toHaveLength(20);
  });

  it("代表性 115 官方一般篩選門檻完整保留", () => {
    const expectedRules = {
      "041052": { order: 3, label: "數A", minScore: 12, rawText: "數A12" },
      "001462": {
        order: 1,
        label: "國文＋英文＋數A＋社會",
        minScore: 51,
        rawText: "國文＋英文＋數A＋社會51",
      },
      "011422": {
        order: 3,
        label: "國文＋英文＋數A＋自然",
        minScore: 51,
        rawText: "國文＋英文＋數A＋自然51",
      },
    } as const;

    Object.entries(expectedRules).forEach(([programCode, expectedRule]) => {
      const program = programs.find(
        (candidate) => candidate.programCode === programCode,
      );
      expect(
        program?.screeningRules.find(
          (rule) => rule.order === expectedRule.order,
        ),
      ).toMatchObject(expectedRule);
      expect(program?.evaluationSupport).toBe("supported");
    });
  });

  it("63 筆 APCS 均由官方表格解析，含 9 筆資安組", () => {
    const apcsPrograms = programs.filter((program) =>
      Object.prototype.hasOwnProperty.call(program, "apcsConceptMin"),
    );
    const securityPrograms = apcsPrograms.filter((program) =>
      program.programName.includes("資安組"),
    );

    expect(apcsPrograms).toHaveLength(63);
    expect(securityPrograms).toHaveLength(9);
    apcsPrograms.forEach((program) => {
      expect(program.additionalScreeningRules?.length).toBeGreaterThan(0);
      expect(program).toHaveProperty("apcsPracticeMin");
      expect(program).toHaveProperty("apcsConceptMultiplier");
      expect(program).toHaveProperty("apcsPracticeMultiplier");
      expect(program.evaluationSupport).toBe("unsupported");
      expect(program.screeningRules).toEqual([]);
      expect(program.reviewReasons?.join(" ")).toContain("APCS");
      expect(program.reviewReasons?.join(" ")).not.toMatch(
        /未能解析|OCR|無法確認/u,
      );
    });
  });

  it("APCS 代表校系保留個別檢定、倍率與依序最低分", () => {
    const expected = {
      "001592": {
        apcsConceptMin: 4,
        apcsPracticeMin: 4,
        apcsConceptMultiplier: null,
        apcsPracticeMultiplier: 5,
        additionalScreeningRules: [
          { label: "數學A", minScore: 11, rawText: "數學A11" },
          { label: "APCS 實作題", minScore: 4, rawText: "APCS 實作題4" },
        ],
      },
      "002352": {
        apcsConceptMin: 3,
        apcsPracticeMin: 3,
        apcsConceptMultiplier: 5,
        apcsPracticeMultiplier: 5,
        additionalScreeningRules: [
          { label: "英文", minScore: 8, rawText: "英文8" },
          {
            label: "APCS 觀念題＋實作題",
            minScore: 6,
            rawText: "APCS 觀念題＋實作題6",
          },
          { label: "數學A", minScore: 10, rawText: "數學A10" },
        ],
      },
      "058102": {
        apcsConceptMin: 3,
        apcsPracticeMin: 2,
        apcsConceptMultiplier: 10,
        apcsPracticeMultiplier: 10,
        additionalScreeningRules: [
          {
            label: "APCS 觀念題＋實作題",
            minScore: 5,
            rawText: "APCS 觀念題＋實作題5",
          },
          { label: "國文＋英文", minScore: 17, rawText: "國文＋英文17" },
        ],
      },
    } as const;

    Object.entries(expected).forEach(([programCode, details]) => {
      expect(
        programs.find((program) => program.programCode === programCode),
      ).toMatchObject(details);
    });
  });

  it("APCS 校系可沿用 114 的成績選填判斷，留白不會被當成零分", () => {
    const apcsPrograms = programs.filter((program) =>
      Object.prototype.hasOwnProperty.call(program, "apcsConceptMin"),
    );
    const fullGsatScores = {
      國文: 15,
      英文: 15,
      數A: 15,
      數B: 15,
      社會: 15,
      自然: 15,
      英聽: 3,
    } as const;

    apcsPrograms.forEach((program) => {
      expect(supportsAcademicPartialEvaluation(program)).toBe(true);
      const blank = evaluateAcademicCriteria(program, fullGsatScores);
      expect(blank.academicPassed).toBe(true);
      expect(blank.passed).toBe(true);
      const hasPublishedApcsMinimum =
        program.apcsConceptMin !== null ||
        program.apcsPracticeMin !== null ||
        program.additionalScreeningRules?.some(
          (rule) => rule.label.includes("APCS") && rule.minScore !== null,
        );
      expect(blank.apcsEvaluation?.complete).toBe(!hasPublishedApcsMinimum);
      expect(blank.apcsEvaluation?.failedRules).toEqual([]);

      const entered = evaluateAcademicCriteria(
        program,
        fullGsatScores,
        undefined,
        { concept: 5, practice: 5 },
      );
      expect(entered.apcsEvaluation?.complete).toBe(true);
      expect(entered.apcsEvaluation?.passed).toBe(true);
      expect(entered.passed).toBe(true);
    });
  });

  it("官方最低分確實為 -- 的 8 校系才使用 dash 無法試算狀態", () => {
    const dashCodes = [
      "027432",
      "034172",
      "042092",
      "044022",
      "050552",
      "059432",
      "099202",
      "130202",
    ];
    const exactReason =
      "官方「通過倍率篩選最低級分」欄為 --，沒有數值可供自動判定。";
    const dashPrograms = programs.filter(
      (program) => program.officialThresholdStatus === "dash",
    );

    expect(dashPrograms.map((program) => program.programCode).sort())
      .toEqual([...dashCodes].sort());
    dashPrograms.forEach((program) => {
      expect(program.reviewReasons).toContain(exactReason);
      expect(program.reviewReasons?.join(" ")).not.toContain("資料缺失");
      expect(supportsProgramEvaluation(program)).toBe(false);
    });
  });

  it("術科與 APCS 特殊檢定維持 114 的無法直接用一般學測完整判斷狀態", () => {
    const apcsPrograms = programs.filter((program) =>
      program.reviewReasons?.some((reason) => reason.includes("APCS")),
    );
    const artPrograms = programs.filter((program) =>
      program.reviewReasons?.some((reason) => reason.includes("術科")),
    );

    expect(apcsPrograms).toHaveLength(63);
    expect(artPrograms).toHaveLength(65);
    expect(programs.filter((program) => program.dataStatus === "needs-review"))
      .toHaveLength(135);
    expect(programs.filter((program) => program.evaluationSupport === "supported"))
      .toHaveLength(2071);
  });

  it("科系搜尋逐字依序比對並依相似度排序", () => {
    const naturalDepartments = toDepartmentOptions(
      toProgramOptions(programs),
      "自然組",
    );
    const computerScience = rankDepartmentOptions(
      naturalDepartments,
      "資工系",
    );
    const dentistry = rankDepartmentOptions(naturalDepartments, "牙醫系");

    expect(computerScience.length).toBeGreaterThan(3);
    expect(
      computerScience.some(
        (department) => department.departmentName === "資訊工程學系",
      ),
    ).toBe(true);
    const firstNonInformationEngineering = computerScience.findIndex(
      (department) => !department.departmentName.includes("資訊工程"),
    );
    const lastInformationEngineering = computerScience.reduce(
      (lastIndex, department, index) =>
        department.departmentName.includes("資訊工程") ? index : lastIndex,
      -1,
    );
    expect(firstNonInformationEngineering).toBeGreaterThanOrEqual(0);
    expect(lastInformationEngineering).toBeLessThan(
      firstNonInformationEngineering,
    );
    expect(dentistry.length).toBeGreaterThan(0);
    expect(
      dentistry.some((department) => department.departmentName === "中醫學系"),
    ).toBe(false);
  });

  it("本頁、搜尋結果與所有科系使用各自正確的全選範圍", () => {
    const naturalDepartments = toDepartmentOptions(
      toProgramOptions(programs),
      "自然組",
    );
    const searchResults = rankDepartmentOptions(
      naturalDepartments,
      "資工系",
    );
    const firstPage = searchResults.slice(0, 4);
    const selectScope = (
      departments: readonly (typeof naturalDepartments)[number][],
    ) =>
      departments.reduce<ProgramSelection>(
        (selection, department) =>
          toggleProgramCodes(selection, department.programCodes),
        { mode: "none", codes: [] },
      );

    const pageSelection = selectScope(firstPage);
    const searchSelection = selectScope(searchResults);
    const allSelection = selectScope(naturalDepartments);

    expect(selectedDepartmentCount(pageSelection, searchResults)).toBe(
      firstPage.length,
    );
    expect(selectedDepartmentCount(searchSelection, searchResults)).toBe(
      searchResults.length,
    );
    expect(
      selectedDepartmentCount(searchSelection, naturalDepartments),
    ).toBeLessThan(naturalDepartments.length);
    expect(selectedDepartmentCount(allSelection, naturalDepartments)).toBe(
      naturalDepartments.length,
    );
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
    expect(selection.codes).toHaveLength(32);
    expect(selectedDepartmentCount(selection, naturalDepartments)).toBe(1);

    const selectedPrograms = filterPrograms(programs, {
      groupedProgramSelections: {
        自然組: selection,
        社會組: { mode: "none", codes: [] },
      },
    });
    expect(selectedPrograms).toHaveLength(32);
    expect(
      selectedPrograms.every(
        (program) => program.programName === "資訊工程學系",
      ),
    ).toBe(true);

    expect(toggleProgramCodes(selection, computerScience.programCodes))
      .toEqual({ mode: "none", codes: [] });
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
      filterMethod: "academic-categories",
      groupSelection: ["自然組"],
      programSelections: {
        自然組: {
          mode: "include",
          codes: ["030012", "030022", "bad-code"],
        },
        社會組: { mode: "none", codes: [] },
      },
    });
    const restored = queryStateFromParams(params);

    expect(restored.groupSelection).toEqual(["自然組"]);
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
      filterMethod: "academic-categories",
      groupSelection: ["自然組", "社會組"],
      programSelections: {
        自然組: { mode: "all", codes: [] },
        社會組: { mode: "all", codes: [] },
      },
    });

    expect(params.get("naturalMode")).toBe("all");
    expect(params.get("socialMode")).toBe("all");
    expect(params.getAll("group")).toEqual(["自然組", "社會組"]);
    expect(params.getAll("natural")).toEqual([]);
    expect(params.getAll("social")).toEqual([]);
  });
});
