import { describe, expect, it } from "vitest";
import {
  deriveRuleSubjects,
  makeRules,
  parseSubjectsFromLabel,
} from "../scripts/buildProgramsFromOfficial";

describe("official program importer", () => {
  it("解析官方單科與學測科目組合縮寫", () => {
    expect(parseSubjectsFromLabel("數學A")).toEqual(["數A"]);
    expect(parseSubjectsFromLabel("英數A自")).toEqual([
      "英文",
      "數A",
      "自然",
    ]);
    expect(parseSubjectsFromLabel("國英數B社")).toEqual([
      "國文",
      "英文",
      "數B",
      "社會",
    ]);
    expect(parseSubjectsFromLabel("APCS")).toBeNull();
  });

  it("依倍率由大到小建立多關 rules array，且同倍率合併科目", () => {
    const result = deriveRuleSubjects([
      { label: "國文", standard: "頂標", multiplier: "--" },
      { label: "英文", standard: "頂標", multiplier: "6" },
      { label: "數學A", standard: "頂標", multiplier: "6" },
      { label: "自然", standard: "頂標", multiplier: "3" },
    ]);

    expect(result.issues).toEqual([]);
    expect(result.rules).toEqual([
      { multiplier: 6, subjects: ["英文", "數A"] },
      { multiplier: 3, subjects: ["自然"] },
    ]);
  });

  it("官方未啟動的篩選欄位不會轉成零分門檻", () => {
    const rules = makeRules(
      [
        { multiplier: 6, subjects: ["數B"] },
        { multiplier: 5, subjects: ["國文"] },
        { multiplier: 3, subjects: ["英文"] },
      ],
      [null, null, 6],
    );

    expect(rules).toEqual([
      {
        order: 1,
        label: "英文",
        subjects: ["英文"],
        minScore: 6,
        rawText: "英文6",
      },
    ]);
  });

  it("保留無法解析的倍率項目為複核原因，禁止靜默假判定", () => {
    const result = deriveRuleSubjects([
      { label: "APCS", standard: "--", multiplier: "3" },
    ]);
    expect(result.rules).toEqual([]);
    expect(result.issues[0]).toContain("無法解析倍率篩選科目");
  });
});
