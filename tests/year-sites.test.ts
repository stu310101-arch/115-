import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { queryStateFromParams } from "../components/queryState";
import {
  ADMISSION_YEARS,
  buildYearResultsUrl,
  type AdmissionYear,
  YEAR_SITES,
} from "../config/yearSites";

const CURRENT_YEAR: AdmissionYear = "115";
const ALL_TRANSFERABLE_PARAMS =
  "ch=12&en=13&ma=11&mb=10&so=12&na=11&li=2&ac=4&ap=3&gender=female";
const DIRECTIONS: readonly [AdmissionYear, AdmissionYear][] = [
  ["113", "114"],
  ["113", "115"],
  ["114", "113"],
  ["114", "115"],
  ["115", "113"],
  ["115", "114"],
];

describe("year site configuration", () => {
  it("keeps the three independent homepage URLs in one configuration", () => {
    expect(ADMISSION_YEARS).toEqual(["113", "114", "115"]);
    expect(YEAR_SITES).toEqual({
      "113": { homeUrl: "https://stu310101-arch.github.io/113-/" },
      "114": { homeUrl: "https://stu310101-arch.github.io/114-/" },
      "115": { homeUrl: "https://stu310101-arch.github.io/115-/" },
    });
  });

  it("wires the homepage and results switchers with the current year", () => {
    const homeSource = readFileSync(
      new URL("../app/page.tsx", import.meta.url),
      "utf8",
    );
    const resultsSource = readFileSync(
      new URL("../components/ResultsWorkspace.tsx", import.meta.url),
      "utf8",
    );
    const switcherSource = readFileSync(
      new URL("../components/YearSwitcher.tsx", import.meta.url),
      "utf8",
    );
    const css = readFileSync(
      new URL("../app/globals.css", import.meta.url),
      "utf8",
    );

    expect(homeSource).toContain(
      `<YearSwitcher currentYear="${CURRENT_YEAR}" variant="home" />`,
    );
    expect(switcherSource).toContain('aria-label="切換回測學年度"');
    expect(switcherSource).toContain('aria-current="page"');
    expect(switcherSource).not.toContain('target="_blank"');
    expect(resultsSource.indexOf("<YearSwitcher")).toBeGreaterThan(-1);
    expect(resultsSource.indexOf("<YearSwitcher")).toBeLessThan(
      resultsSource.indexOf("<SubpageHeader"),
    );
    expect(resultsSource).toMatch(
      /groupedProgramSelections:\s*hasProgramSelection\s*\?\s*query\.programSelections\s*:\s*undefined/s,
    );
    expect(css).toMatch(/a\.year-switcher__link:hover/);
    expect(css).toMatch(/a\.year-switcher__link:focus-visible/);
    expect(css).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.year-switcher__links \{[\s\S]*?grid-template-columns: 1fr/,
    );
  });
});

describe("cross-year result URLs", () => {
  it.each(DIRECTIONS)(
    "builds the %s to %s results URL",
    (_sourceYear, targetYear) => {
      expect(buildYearResultsUrl(targetYear, "ch=12")).toBe(
        `${YEAR_SITES[targetYear].homeUrl}results/?ch=12`,
      );
    },
  );

  it("transfers every shared score field and restores it at the target", () => {
    const source = new URLSearchParams(ALL_TRANSFERABLE_PARAMS);
    source.set("schoolIds", "001,002");
    source.set("natural", "001012");
    source.set("group", "自然組");

    const url = buildYearResultsUrl("115", source);
    expect(url).toBe(
      `${YEAR_SITES["115"].homeUrl}results/?${ALL_TRANSFERABLE_PARAMS}`,
    );

    const restored = queryStateFromParams(new URL(url).searchParams);
    expect(restored.scores).toEqual({
      國文: "12",
      英文: "13",
      數A: "11",
      數B: "10",
      社會: "12",
      自然: "11",
      英聽: "2",
    });
    expect(restored.apcsScores).toEqual({ concept: "4", practice: "3" });
    expect(restored.applicantGender).toBe("female");
    expect(restored.schoolGroupIds).toEqual([]);
    expect(restored.customSchoolIds).toEqual([]);
  });

  it("omits blank and year-specific values", () => {
    const url = buildYearResultsUrl(
      "114",
      "?ch=12&en=&ma=%20%20&schoolIds=001&filterBy=learning-groups",
    );
    expect(url).toBe(`${YEAR_SITES["114"].homeUrl}results/?ch=12`);
  });

  it("handles empty and encoded queries without malformed separators", () => {
    const emptyUrl = buildYearResultsUrl("113", "");
    expect(emptyUrl).toBe(`${YEAR_SITES["113"].homeUrl}results/`);

    const encodedUrl = buildYearResultsUrl(
      "113",
      new URLSearchParams({ gender: "女性 / X" }),
    );
    expect(encodedUrl).toContain(
      "gender=%E5%A5%B3%E6%80%A7+%2F+X",
    );
    expect(encodedUrl.replace("https://", "")).not.toContain("//");
    expect(encodedUrl).not.toContain("??");
  });
});
