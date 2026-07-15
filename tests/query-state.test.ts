import { describe, expect, it } from "vitest";
import { SCHOOL_GROUP_IDS } from "../config/schoolGroups";
import {
  DEFAULT_QUERY_STATE,
  queryStateFromParams,
  queryStateToParams,
  restoreQueryState,
} from "../components/queryState";

function restoreFromSession(key: string, value: unknown) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const stored = new Map([[key, JSON.stringify(value)]]);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { search: "" },
      sessionStorage: {
        getItem: (name: string) => stored.get(name) ?? null,
        setItem: (name: string, nextValue: string) => stored.set(name, nextValue),
      },
    },
  });

  try {
    return restoreQueryState();
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
}

describe("school query state", () => {
  it("APCS 觀念題與實作題可選填、可寫入網址，留白不會變成零分", () => {
    const params = queryStateToParams({
      ...DEFAULT_QUERY_STATE,
      apcsScores: { concept: "4", practice: "3" },
    });

    expect(params.get("ac")).toBe("4");
    expect(params.get("ap")).toBe("3");
    expect(queryStateFromParams(params).apcsScores).toEqual({
      concept: "4",
      practice: "3",
    });
    expect(queryStateFromParams(new URLSearchParams()).apcsScores).toEqual({
      concept: "",
      practice: "",
    });
    expect(
      queryStateFromParams(new URLSearchParams("ac=9&ap=-2")).apcsScores,
    ).toEqual({ concept: "5", practice: "0" });
  });

  it("v8 session 未保存 APCS 時會安全升級為留白", () => {
    const restored = restoreFromSession("admission-114-query-v8", {
      ...DEFAULT_QUERY_STATE,
      apcsScores: undefined,
    });

    expect(restored.apcsScores).toEqual({ concept: "", practice: "" });
  });

  it("自然組與社會組可複選並完整寫入網址", () => {
    const params = queryStateToParams({
      ...DEFAULT_QUERY_STATE,
      groupSelection: ["自然組", "社會組"],
    });

    expect(params.getAll("group")).toEqual(["自然組", "社會組"]);
    expect(queryStateFromParams(params).groupSelection).toEqual([
      "自然組",
      "社會組",
    ]);
    expect(
      queryStateFromParams(
        new URLSearchParams("group=自然組&group=unknown&group=自然組"),
      ).groupSelection,
    ).toEqual(["自然組"]);
  });

  it("v7 的單一組別狀態會升級為複選陣列", () => {
    const restored = restoreFromSession("admission-114-query-v7", {
      ...DEFAULT_QUERY_STATE,
      groupSelection: "社會組",
    });

    expect(restored.groupSelection).toEqual(["社會組"]);
  });

  it("官方十八學群可不選、單選或複選並安全寫入網址", () => {
    const params = queryStateToParams({
      ...DEFAULT_QUERY_STATE,
      groupSelection: ["自然組"],
      learningGroupIds: ["information", "engineering"],
    });

    expect(params.getAll("learningGroup")).toEqual([
      "information",
      "engineering",
    ]);
    expect(queryStateFromParams(params).learningGroupIds).toEqual([
      "information",
      "engineering",
    ]);
    expect(
      queryStateFromParams(
        new URLSearchParams(
          "group=自然組&learningGroup=unknown&learningGroup=health-medicine",
        ),
      ).learningGroupIds,
    ).toEqual(["health-medicine"]);
    expect(queryStateFromParams(new URLSearchParams()).learningGroupIds).toEqual(
      [],
    );
  });

  it("十八學群會依招生組別移除不相容的選項", () => {
    const socialOnly = queryStateFromParams(
      new URLSearchParams(
        "group=社會組&learningGroup=information&learningGroup=engineering&learningGroup=management",
      ),
    );
    const bothGroups = queryStateFromParams(
      new URLSearchParams(
        "group=自然組&group=社會組&learningGroup=information&learningGroup=management",
      ),
    );

    expect(socialOnly.learningGroupIds).toEqual(["management"]);
    expect(bothGroups.learningGroupIds).toEqual([
      "information",
      "management",
    ]);
    expect(
      queryStateToParams({
        ...DEFAULT_QUERY_STATE,
        groupSelection: ["社會組"],
        learningGroupIds: ["information", "law-politics"],
      }).getAll("learningGroup"),
    ).toEqual(["law-politics"]);
  });

  it("官方招生性別組別可寫入網址，非法值會安全忽略", () => {
    const params = queryStateToParams({
      ...DEFAULT_QUERY_STATE,
      applicantGender: "female",
    });

    expect(params.get("gender")).toBe("female");
    expect(queryStateFromParams(params).applicantGender).toBe("female");
    expect(
      queryStateFromParams(new URLSearchParams("gender=unknown"))
        .applicantGender,
    ).toBe("");
  });

  it("多個學校分類與自訂學校可完整寫入並讀回網址", () => {
    const params = queryStateToParams({
      ...DEFAULT_QUERY_STATE,
      schoolGroupIds: [
        SCHOOL_GROUP_IDS.TOP,
        SCHOOL_GROUP_IDS.CENTRAL,
        SCHOOL_GROUP_IDS.TEACHER,
      ],
      customSchoolIds: ["108", "152"],
    });

    expect(params.getAll("schoolGroup")).toEqual([
      "top",
      "central",
      "teacher",
    ]);
    expect(params.get("schoolMode")).toBe("multi");
    expect(params.get("schoolIds")).toBe("108,152");

    const restored = queryStateFromParams(params);
    expect(restored.schoolGroupIds).toEqual([
      "top",
      "central",
      "teacher",
    ]);
    expect(restored.customSchoolIds).toEqual(["108", "152"]);
  });

  it("舊版單一群組會忽略當時不生效的殘留自訂校碼", () => {
    const restored = queryStateFromParams(
      new URLSearchParams("school=central&schoolIds=108,152"),
    );

    expect(restored.schoolGroupIds).toEqual([SCHOOL_GROUP_IDS.CENTRAL]);
    expect(restored.customSchoolIds).toEqual([]);
  });

  it("舊版自訂模式仍會保留自訂學校", () => {
    const restored = queryStateFromParams(
      new URLSearchParams("school=custom&schoolIds=108,152"),
    );

    expect(restored.schoolGroupIds).toEqual([]);
    expect(restored.customSchoolIds).toEqual(["108", "152"]);
  });

  it("舊版全部學校殘留的 schoolIds 不會誤縮小範圍", () => {
    const restored = queryStateFromParams(
      new URLSearchParams("schoolIds=108,152"),
    );

    expect(restored.schoolGroupIds).toEqual([]);
    expect(restored.customSchoolIds).toEqual([]);
  });

  it("新版只選自訂學校會以模式標記與舊網址區分", () => {
    const params = queryStateToParams({
      ...DEFAULT_QUERY_STATE,
      customSchoolIds: ["108", "152"],
    });

    expect(params.toString()).toBe("schoolMode=multi&schoolIds=108%2C152");
    expect(queryStateFromParams(params).customSchoolIds).toEqual([
      "108",
      "152",
    ]);
  });

  it("v3 session 的群組模式會忽略殘留自訂學校", () => {
    const restored = restoreFromSession("admission-114-query-v3", {
      schoolSelection: "top",
      customSchoolIds: ["108"],
    });

    expect(restored.schoolGroupIds).toEqual([SCHOOL_GROUP_IDS.TOP]);
    expect(restored.customSchoolIds).toEqual([]);
  });

  it("v3 session 的自訂模式會保留有效校碼", () => {
    const restored = restoreFromSession("admission-114-query-v3", {
      schoolSelection: "custom",
      customSchoolIds: ["108", "bad"],
    });

    expect(restored.schoolGroupIds).toEqual([]);
    expect(restored.customSchoolIds).toEqual(["108"]);
  });

  it("非法分類與校碼會被忽略，空選擇代表全部學校", () => {
    const restored = queryStateFromParams(
      new URLSearchParams(
        "schoolGroup=unknown&schoolGroup=teacher&schoolIds=108,bad,1234",
      ),
    );

    expect(restored.schoolGroupIds).toEqual([SCHOOL_GROUP_IDS.TEACHER]);
    expect(restored.customSchoolIds).toEqual(["108"]);
    expect(queryStateFromParams(new URLSearchParams()).schoolGroupIds).toEqual(
      [],
    );
  });
});
