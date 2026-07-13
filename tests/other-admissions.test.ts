import { describe, expect, it } from "vitest";
import {
  JCTV_114_ENTRIES,
  OTHER_ADMISSION_ENTRIES,
  OTHER_ADMISSION_SOURCES,
} from "../config/otherAdmissions";
import { routePath } from "../components/queryState";

describe("其他招生管道資料", () => {
  it("完整區分 7 所軍事院校、警大、59 所科技校院與 5 所其他學校", () => {
    const countByCategory = Object.groupBy(
      OTHER_ADMISSION_ENTRIES,
      (entry) => entry.category,
    );

    expect(countByCategory.軍事院校).toHaveLength(7);
    expect(countByCategory.警政院校).toHaveLength(1);
    expect(countByCategory.科技校院).toHaveLength(59);
    expect(countByCategory.其他管道).toHaveLength(5);
    expect(OTHER_ADMISSION_ENTRIES).toHaveLength(72);
    expect(new Set(OTHER_ADMISSION_ENTRIES.map((entry) => entry.id)).size).toBe(
      72,
    );
  });

  it("JCTV 114 名單保留官方 59 個三碼與法律名稱", () => {
    expect(JCTV_114_ENTRIES).toHaveLength(59);
    expect(new Set(JCTV_114_ENTRIES.map((entry) => entry.code)).size).toBe(59);
    expect(JCTV_114_ENTRIES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "101",
          name: "國立臺灣科技大學",
        }),
        expect.objectContaining({
          code: "204",
          name: "嘉藥學校財團法人嘉南藥理大學",
        }),
        expect.objectContaining({
          code: "237",
          name: "長庚學校財團法人長庚科技大學",
        }),
        expect.objectContaining({
          code: "417",
          name: "德育學校財團法人德育護理健康學院",
        }),
      ]),
    );
  });

  it("國防醫學院 114 校名與現名都能由索引找到", () => {
    const school = OTHER_ADMISSION_ENTRIES.find(
      (entry) => entry.id === "military-7",
    );

    expect(school?.name).toBe("國防醫學院");
    expect(school?.aliases).toContain("國防醫學大學");
  });

  it("避免把非學士或非學測管道誤解為 CAC 回測資料", () => {
    expect(
      OTHER_ADMISSION_ENTRIES.find((entry) => entry.id === "tpa")?.note,
    ).toBe("114 為二年制專科警員班，非學士班且不採學測。");
    expect(
      ["dila", "tcpa", "nou", "ouk"].map(
        (id) => OTHER_ADMISSION_ENTRIES.find((entry) => entry.id === id)?.note,
      ),
    ).toEqual([
      expect.stringContaining("不適用 CAC 學測"),
      expect.stringContaining("不適用 CAC 學測"),
      expect.stringContaining("不適用 CAC 學測"),
      expect.stringContaining("不適用 CAC 學測"),
    ]);
  });

  it("列出指定的其他學校與各類官方主來源", () => {
    const searchableNames = OTHER_ADMISSION_ENTRIES.flatMap((entry) => [
      entry.name,
      ...(entry.aliases ?? []),
    ]);

    expect(searchableNames).toEqual(
      expect.arrayContaining([
        "中央警察大學",
        "法鼓文理學院",
        "國立臺灣戲曲學院",
        "國立空中大學",
        "高雄市立空中大學",
        "臺灣警察專科學校",
      ]),
    );
    expect(OTHER_ADMISSION_SOURCES.military.url).toContain("mnd.gov.tw");
    expect(OTHER_ADMISSION_SOURCES.cac.url).toContain("cac.edu.tw/apply114");
    expect(OTHER_ADMISSION_SOURCES.policeUniversity.url).toContain(
      "daa.cpu.edu.tw",
    );
    expect(OTHER_ADMISSION_SOURCES.technology.url).toContain(
      "academicYear=114",
    );
    expect(OTHER_ADMISSION_SOURCES.moe.url).toBe(
      "https://udb.moe.edu.tw/ulist/Resource",
    );
  });

  it("新頁路徑是獨立 route", () => {
    expect(routePath("other-admissions")).toBe("/other-admissions");
  });

  it("從子路徑部署的新頁仍能正確返回同一網站的其他頁", () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { pathname: "/preview/other-admissions" } },
    });

    try {
      expect(routePath("home")).toBe("/preview/");
      expect(routePath("query")).toBe("/preview/query");
    } finally {
      if (originalWindow) {
        Object.defineProperty(globalThis, "window", originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    }
  });
});
