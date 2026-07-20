import { describe, expect, it } from "vitest";

import {
  academicScreeningRulesFor,
  evaluateAcademicCriteria,
  evaluateProgram,
  supportsAcademicPartialEvaluation,
} from "../lib/admission";
import type {
  Program,
  ScreeningRule,
  Subject,
  SubjectBoost,
  UserScores,
} from "../lib/types";

const SOURCE = {
  collegeListUrl: "https://example.test/collegeList.htm",
  reportHtmlUrl: "https://example.test/report/016.htm",
  reportImageUrl: "https://example.test/report/pict/016.png",
};

function rule(
  order: number,
  subjects: Subject[],
  minScore: number,
): ScreeningRule {
  return {
    order,
    label: subjects.join("+"),
    subjects,
    minScore,
    rawText: `${subjects.join("+")}>=${minScore}`,
  };
}

function program(
  screeningRules: ScreeningRule[],
  overrides: Partial<Program> = {},
): Program {
  return {
    year: 115,
    schoolId: "016",
    schoolName: "國立中央大學",
    programCode: "016001",
    programName: "測試學系",
    groupTags: ["自然組"],
    departmentKeywords: [],
    screeningRules,
    source: SOURCE,
    dataStatus: "complete",
    evaluationSupport: "supported",
    verified: true,
    ...overrides,
  };
}

function applyBoost(scores: UserScores, boost: SubjectBoost): UserScores {
  const boosted = { ...scores };
  for (const change of boost.changes) {
    boosted[change.subject] = change.to;
  }
  return boosted;
}

describe("evaluateProgram", () => {
  it("判斷單科規則並計算 deficit", () => {
    const result = evaluateProgram(program([rule(1, ["數A"], 12)]), {
      數A: 11,
    });

    expect(result.passed).toBe(false);
    expect(result.ruleResults[0]).toMatchObject({
      userScore: 11,
      minScore: 12,
      deficit: 1,
      passed: false,
    });
    expect(result.totalDeficit).toBe(1);
    expect(result.nearestBoost[0]).toEqual({
      totalPoints: 1,
      changes: [{ subject: "數A", points: 1, from: 11, to: 12 }],
    });
  });

  it("性別分列校系只套用對應組別的名額與門檻", () => {
    const target = program([], {
      screeningVariants: [
        {
          applicantGender: "male",
          label: "男生組",
          quota: 8,
          screeningRules: [rule(1, ["國文", "英文"], 25)],
        },
        {
          applicantGender: "female",
          label: "女生組",
          quota: 9,
          screeningRules: [rule(1, ["國文", "英文"], 27)],
        },
      ],
    });
    const scores = { 國文: 12, 英文: 13 };

    const male = evaluateProgram(target, scores, "male");
    const female = evaluateProgram(target, scores, "female");

    expect(male.passed).toBe(true);
    expect(male.screeningVariant).toMatchObject({ label: "男生組", quota: 8 });
    expect(female.passed).toBe(false);
    expect(female.screeningVariant).toMatchObject({ label: "女生組", quota: 9 });
    expect(() => evaluateProgram(target, scores)).toThrow("性別組別");
  });

  it("加總組合科目後判斷門檻", () => {
    const result = evaluateProgram(
      program([rule(1, ["英文", "數A", "自然"], 37)]),
      { 英文: 13, 數A: 11, 自然: 11 },
    );

    expect(result.ruleResults[0]).toMatchObject({
      userScore: 35,
      deficit: 2,
      passed: false,
    });
    expect(result.nearestBoost).toHaveLength(5);
    expect(result.nearestBoost.every((plan) => plan.totalPoints === 2)).toBe(
      true,
    );
    expect(
      result.nearestBoost.every(
        (plan) =>
          evaluateProgram(
            program([rule(1, ["英文", "數A", "自然"], 37)]),
            applyBoost({ 英文: 13, 數A: 11, 自然: 11 }, plan),
          ).passed,
      ),
    ).toBe(true);
  });

  it("多關規則必須同時通過，並以真正最小加分而非 deficit 加總回傳方案", () => {
    const target = program([
      rule(1, ["英文", "自然"], 23),
      rule(2, ["數A"], 12),
      rule(3, ["英文", "數A", "自然"], 39),
    ]);
    const scores = { 英文: 13, 數A: 11, 自然: 11 };
    const result = evaluateProgram(target, scores);

    expect(result.ruleResults.map(({ passed }) => passed)).toEqual([
      true,
      false,
      false,
    ]);
    expect(result.passed).toBe(false);
    expect(result.failedRules).toHaveLength(2);
    expect(result.totalDeficit).toBe(5);
    expect(result.nearestBoost).not.toHaveLength(0);
    expect(result.nearestBoost.every((plan) => plan.totalPoints === 4)).toBe(
      true,
    );
    for (const plan of result.nearestBoost) {
      expect(evaluateProgram(target, applyBoost(scores, plan)).passed).toBe(true);
      expect(plan.changes.every((change) => change.to <= 15)).toBe(true);
    }
  });

  it("判斷中山資管國文、英文、數A組合範例為通過", () => {
    const target = program([rule(1, ["國文", "英文", "數A"], 36)], {
      schoolId: "027",
      schoolName: "國立中山大學",
      programCode: "027001",
      programName: "資訊管理學系",
    });

    const result = evaluateProgram(target, { 國文: 12, 英文: 13, 數A: 11 });

    expect(result.passed).toBe(true);
    expect(result.ruleResults[0]).toMatchObject({
      userScore: 36,
      deficit: 0,
      passed: true,
    });
    expect(result.failedRules).toEqual([]);
    expect(result.nearestBoost).toEqual([]);
  });

  it("未輸入科目以 0 計算並列入 missingSubjects", () => {
    const target = program([rule(1, ["自然"], 13)]);
    const missing = evaluateProgram(target, {});
    const enteredZero = evaluateProgram(target, { 自然: 0 });

    expect(missing.ruleResults[0]).toMatchObject({
      userScore: 0,
      deficit: 13,
      passed: false,
    });
    expect(missing.missingSubjects).toEqual(["自然"]);
    expect(missing.nearestBoost[0]).toEqual({
      totalPoints: 13,
      changes: [{ subject: "自然", points: 13, from: 0, to: 13 }],
    });
    expect(enteredZero.ruleResults[0].userScore).toBe(0);
    expect(enteredZero.missingSubjects).toEqual([]);
  });

  it("同時滿足多條重疊規則，且不讓任何科目超過 15", () => {
    const target = program([
      rule(1, ["英文", "自然"], 29),
      rule(2, ["數A", "自然"], 29),
      rule(3, ["英文", "數A"], 29),
    ]);
    const scores = { 英文: 13, 數A: 13, 自然: 15 };
    const result = evaluateProgram(target, scores);

    expect(result.nearestBoost).toEqual([
      {
        totalPoints: 3,
        changes: [
          { subject: "英文", points: 1, from: 13, to: 14 },
          { subject: "數A", points: 2, from: 13, to: 15 },
        ],
      },
      {
        totalPoints: 3,
        changes: [
          { subject: "英文", points: 2, from: 13, to: 15 },
          { subject: "數A", points: 1, from: 13, to: 14 },
        ],
      },
    ]);
    expect(
      result.nearestBoost.every((plan) =>
        evaluateProgram(target, applyBoost(scores, plan)).passed,
      ),
    ).toBe(true);
  });

  it("15 級上限內無解時回傳空的 nearestBoost", () => {
    const result = evaluateProgram(program([rule(1, ["英文"], 16)]), {
      英文: 15,
    });

    expect(result.passed).toBe(false);
    expect(result.totalDeficit).toBe(1);
    expect(result.nearestBoost).toEqual([]);
  });

  it("拒絕官方門檻仍待確認的校系資料", () => {
    const target = program([], {
      dataStatus: "needs-review",
      evaluationSupport: "unsupported",
      verified: false,
    });

    expect(() => evaluateProgram(target, { 英文: 15 })).toThrow(
      "尚待確認",
    );
  });

  it("特殊檢定校系只試算可確認的學測門檻，不把 APCS 分數當學測", () => {
    const target = program([], {
      schoolId: "003",
      schoolName: "國立中興大學",
      programCode: "003082",
      programName: "資訊管理學系（APCS組）",
      requirements: [
        {
          subject: "英文",
          standard: "前標",
          minScore: 11,
          rawText: "英文前標",
        },
      ],
      additionalScreeningRules: [
        { label: "英文＋自然", minScore: 23, rawText: "英文＋自然23" },
        {
          label: "APCS 觀念題＋實作題",
          minScore: 6,
          rawText: "APCS 觀念題＋實作題6",
        },
        { label: "數學A", minScore: 9, rawText: "數學A9" },
      ],
      dataStatus: "needs-review",
      evaluationSupport: "unsupported",
      reviewReasons: ["需特殊檢定：APCS"],
      verified: false,
    });

    expect(supportsAcademicPartialEvaluation(target)).toBe(true);
    expect(academicScreeningRulesFor(target)).toEqual([
      expect.objectContaining({
        order: 1,
        label: "英文＋自然",
        subjects: ["英文", "自然"],
        minScore: 23,
      }),
      expect.objectContaining({
        order: 2,
        label: "數學A",
        subjects: ["數A"],
        minScore: 9,
      }),
    ]);

    const result = evaluateAcademicCriteria(target, {
      英文: 11,
      自然: 12,
      數A: 8,
    });
    expect(result.ruleResults.map((item) => item.rule.label)).toEqual([
      "英文＋自然",
      "數學A",
    ]);
    expect(result.requirementResults[0].passed).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.nearestBoost[0]).toEqual({
      totalPoints: 1,
      changes: [{ subject: "數A", points: 1, from: 8, to: 9 }],
    });
  });

  it("APCS 留白不當零分，有填才納入判斷並保留學測失敗原因", () => {
    const target = program([], {
      programName: "資訊工程學系（APCS組）",
      requirements: [
        {
          subject: "英文",
          standard: "均標",
          minScore: 8,
          rawText: "英文均標",
        },
      ],
      additionalScreeningRules: [
        {
          label: "APCS 觀念題＋實作題",
          minScore: 7,
          rawText: "APCS 觀念題＋實作題7",
        },
      ],
      apcsConceptMin: 4,
      apcsPracticeMin: 3,
      apcsConceptMultiplier: 5,
      apcsPracticeMultiplier: 5,
      dataStatus: "needs-review",
      evaluationSupport: "unsupported",
      reviewReasons: ["需特殊檢定：APCS"],
      verified: false,
    });

    const blank = evaluateAcademicCriteria(target, { 英文: 8 });
    expect(blank.academicPassed).toBe(true);
    expect(blank.passed).toBe(true);
    expect(blank.apcsEvaluation).toMatchObject({
      complete: false,
      passed: null,
      providedParts: [],
      missingParts: ["concept", "practice"],
      failedRules: [],
    });

    const partial = evaluateAcademicCriteria(
      target,
      { 英文: 8 },
      undefined,
      { concept: 4 },
    );
    expect(partial.passed).toBe(true);
    expect(partial.apcsEvaluation).toMatchObject({
      complete: false,
      passed: null,
      providedParts: ["concept"],
      missingParts: ["practice"],
    });

    const apcsFailed = evaluateAcademicCriteria(
      target,
      { 英文: 8 },
      undefined,
      { concept: 4, practice: 0 },
    );
    expect(apcsFailed.academicPassed).toBe(true);
    expect(apcsFailed.passed).toBe(false);
    expect(apcsFailed.apcsEvaluation).toMatchObject({
      complete: true,
      passed: false,
    });
    expect(apcsFailed.apcsEvaluation?.failedRules).toHaveLength(2);

    const allPassed = evaluateAcademicCriteria(
      target,
      { 英文: 8 },
      undefined,
      { concept: 4, practice: 3 },
    );
    expect(allPassed.academicPassed).toBe(true);
    expect(allPassed.passed).toBe(true);
    expect(allPassed.apcsEvaluation).toMatchObject({
      complete: true,
      passed: true,
      failedRules: [],
    });

    const gsatFailed = evaluateAcademicCriteria(
      target,
      { 英文: 7 },
      undefined,
      { concept: 4, practice: 3 },
    );
    expect(gsatFailed.academicPassed).toBe(false);
    expect(gsatFailed.apcsEvaluation?.passed).toBe(true);
    expect(gsatFailed.passed).toBe(false);
  });

  it("只有特殊術科、沒有獨立學測門檻時不自行推估", () => {
    const target = program([], {
      additionalScreeningRules: [
        { label: "素描", minScore: 70, rawText: "素描70" },
      ],
      dataStatus: "needs-review",
      evaluationSupport: "unsupported",
      reviewReasons: ["需特殊檢定：術科"],
      verified: false,
    });

    expect(supportsAcademicPartialEvaluation(target)).toBe(false);
    expect(() => evaluateAcademicCriteria(target, {})).toThrow(
      "沒有可獨立試算",
    );
  });

  it("檢定標準與倍率篩選規則必須同時通過", () => {
    const target = program([rule(1, ["英文", "自然"], 20)], {
      requirements: [
        {
          subject: "英文",
          standard: "前標",
          minScore: 11,
          rawText: "英文前標",
        },
      ],
    });

    const result = evaluateProgram(target, { 英文: 10, 自然: 10 });
    expect(result.ruleResults[0].passed).toBe(true);
    expect(result.requirementResults[0].passed).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.totalDeficit).toBe(1);
    expect(result.nearestBoost[0]).toEqual({
      totalPoints: 1,
      changes: [{ subject: "英文", points: 1, from: 10, to: 11 }],
    });
  });

  it("英聽檢定可單獨成為第一階條件並使用 A、B、C 等級換算", () => {
    const target = program([], {
      requirements: [
        {
          subject: "英聽",
          standard: "B級",
          minScore: 2,
          rawText: "英聽B級",
        },
      ],
    });

    expect(evaluateProgram(target, { 英聽: 3 }).passed).toBe(true);

    const below = evaluateProgram(target, { 英聽: 1 });
    expect(below.passed).toBe(false);
    expect(below.totalDeficit).toBe(1);
    expect(below.nearestBoost[0]).toEqual({
      totalPoints: 1,
      changes: [{ subject: "英聽", points: 1, from: 1, to: 2 }],
    });
  });

  it("拒絕超出 0 到 15 的成績", () => {
    const target = program([rule(1, ["英文"], 10)]);

    expect(() => evaluateProgram(target, { 英文: 16 })).toThrow(RangeError);
    expect(() => evaluateProgram(target, { 英文: -1 })).toThrow(RangeError);
  });
});
