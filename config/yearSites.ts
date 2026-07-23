export const ADMISSION_YEARS = ["113", "114", "115"] as const;

export type AdmissionYear = (typeof ADMISSION_YEARS)[number];

export const YEAR_SITES: Record<AdmissionYear, { homeUrl: string }> = {
  "113": { homeUrl: "https://stu310101-arch.github.io/113-/" },
  "114": { homeUrl: "https://stu310101-arch.github.io/114-/" },
  "115": { homeUrl: "https://stu310101-arch.github.io/115-/" },
};

const TRANSFERABLE_QUERY_PARAM_KEYS = [
  "ch",
  "en",
  "ma",
  "mb",
  "so",
  "na",
  "li",
  "ac",
  "ap",
  "gender",
] as const;

function normalizeSearchParams(
  searchParams: URLSearchParams | string,
): URLSearchParams {
  if (searchParams instanceof URLSearchParams) {
    return searchParams;
  }

  return new URLSearchParams(searchParams.trim().replace(/^\?/, ""));
}

export function buildYearResultsUrl(
  targetYear: AdmissionYear,
  searchParams: URLSearchParams | string,
): string {
  const sourceParams = normalizeSearchParams(searchParams);
  const transferableParams = new URLSearchParams();

  TRANSFERABLE_QUERY_PARAM_KEYS.forEach((key) => {
    const value = sourceParams.get(key);
    if (value !== null && value.trim() !== "") {
      transferableParams.set(key, value);
    }
  });

  const resultsUrl = new URL("results/", YEAR_SITES[targetYear].homeUrl);
  const query = transferableParams.toString();
  return query ? `${resultsUrl.toString()}?${query}` : resultsUrl.toString();
}
