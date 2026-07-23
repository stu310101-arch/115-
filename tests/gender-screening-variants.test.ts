import { describe, expect, it } from "vitest";

import programsJson from "../data/programs_115.json";
import { evaluateProgram } from "../lib/admission";
import type { Program, UserScores } from "../lib/types";

const programs = programsJson as Program[];

const expectedVariants = {
  "001082": {
    quota: 17,
    male: {
      quota: 8,
      thresholds: [10, 6, 43, 12, 13],
    },
    female: {
      quota: 9,
      thresholds: [10, 6, 45, 13, 14],
    },
    boundaryScores: { 國文: 12, 英文: 13, 數B: 6, 社會: 12 },
  },
  "027032": {
    quota: 30,
    male: { quota: 10, thresholds: [10, 5] },
    female: { quota: 20, thresholds: [10, 7] },
    boundaryScores: { 國文: 10, 英文: 5 },
  },
  "031252": {
    quota: 28,
    male: { quota: 14, thresholds: [2] },
    female: { quota: 14, thresholds: [3, 1] },
    boundaryScores: { 國文: 2, 數B: 0 },
  },
  "033222": {
    quota: 22,
    male: { quota: 5, thresholds: [15] },
    female: { quota: 17, thresholds: [16] },
    boundaryScores: { 國文: 10, 英文: 5 },
  },
  "056042": {
    quota: 20,
    male: { quota: 10, thresholds: [23] },
    female: { quota: 10, thresholds: [30] },
    boundaryScores: { 國文: 9, 英文: 6, 社會: 8, 英聽: 2 },
  },
} as const satisfies Record<
  string,
  {
    quota: number;
    male: { quota: number; thresholds: readonly number[] };
    female: { quota: number; thresholds: readonly number[] };
    boundaryScores: UserScores;
  }
>;

describe("115 官方性別分列篩選門檻", () => {
  it("保留五個一般學測校系的男女名額與各自門檻", () => {
    expect(
      programs
        .filter((program) => (program.screeningVariants?.length ?? 0) > 0)
        .map((program) => program.programCode)
        .sort(),
    ).toEqual(Object.keys(expectedVariants).sort());

    for (const [programCode, expected] of Object.entries(expectedVariants)) {
      const program = programs.find(
        (candidate) => candidate.programCode === programCode,
      );
      const male = program?.screeningVariants?.find(
        (variant) => variant.applicantGender === "male",
      );
      const female = program?.screeningVariants?.find(
        (variant) => variant.applicantGender === "female",
      );

      expect(program?.quota).toBe(expected.quota);
      expect(program?.screeningRules).toEqual([]);
      expect(program?.evaluationSupport).toBe("supported");
      expect(male?.quota).toBe(expected.male.quota);
      expect(female?.quota).toBe(expected.female.quota);
      expect(male?.screeningRules.map((rule) => rule.minScore)).toEqual(
        expected.male.thresholds,
      );
      expect(female?.screeningRules.map((rule) => rule.minScore)).toEqual(
        expected.female.thresholds,
      );
    }
  });

  it("同一組邊界成績會通過男生組但不會誤通過女生組", () => {
    for (const [programCode, expected] of Object.entries(expectedVariants)) {
      const program = programs.find(
        (candidate) => candidate.programCode === programCode,
      );
      expect(program).toBeDefined();
      expect(evaluateProgram(program!, expected.boundaryScores, "male").passed)
        .toBe(true);
      expect(
        evaluateProgram(program!, expected.boundaryScores, "female").passed,
      ).toBe(false);
    }
  });

  it("術科男女分列校系仍維持特殊檢定，不納入一般學測自動判定", () => {
    const sculpture = programs.find(
      (program) => program.programCode === "056162",
    );

    expect(sculpture?.programName).toBe("雕塑學系");
    expect(sculpture?.evaluationSupport).toBe("unsupported");
    expect(sculpture?.screeningVariants).toBeUndefined();
  });
});
