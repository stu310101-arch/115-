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
