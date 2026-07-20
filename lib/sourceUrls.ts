/** Official 115 school-level source index published by the admission committee. */
export const CAC_115_COLLEGE_LIST_URL =
  "https://www.cac.edu.tw/CacLink/apply115/115Apply_sievE_Result_querY_615JG8Wgh9d/html_sieve_result_115_Zx57f1dW/Standard/collegeList.htm" as const;

export const CAC_115_STANDARD_BASE_URL = new URL(
  "./",
  CAC_115_COLLEGE_LIST_URL,
).href;

/** The archived 115 list contains 64 university links. */
export const CAC_115_EXPECTED_SCHOOL_COUNT = 64;

export type SchoolSource115 = {
  schoolId: string;
  schoolName: string;
  reportHtmlUrl: string;
  reportImageUrl: string;
  collegeListUrl: string;
};

const officialOrigin = new URL(CAC_115_COLLEGE_LIST_URL).origin;
const officialPathPrefix = new URL(CAC_115_STANDARD_BASE_URL).pathname;

function assertSchoolId(schoolId: string): void {
  if (!/^\d{3}$/.test(schoolId)) {
    throw new Error(`Invalid CAC school id: ${schoolId}`);
  }
}

export function reportHtmlUrlForSchool(schoolId: string): string {
  assertSchoolId(schoolId);
  return new URL(`report/${schoolId}.htm`, CAC_115_STANDARD_BASE_URL).href;
}

export function reportImageUrlForSchool(schoolId: string): string {
  assertSchoolId(schoolId);
  return new URL(`report/pict/${schoolId}.png`, CAC_115_STANDARD_BASE_URL).href;
}

export function isOfficialCac115SourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === officialOrigin &&
      url.username === "" &&
      url.password === "" &&
      url.pathname.startsWith(officialPathPrefix)
    );
  } catch {
    return false;
  }
}

export function assertOfficialCac115SourceUrl(value: string): void {
  if (!isOfficialCac115SourceUrl(value)) {
    throw new Error(`URL is outside the official CAC 115 source tree: ${value}`);
  }
}

export function resolveOfficialCac115SourceUrl(
  value: string,
  baseUrl: string = CAC_115_COLLEGE_LIST_URL,
): string {
  const resolved = new URL(value, baseUrl).href;
  assertOfficialCac115SourceUrl(resolved);
  return resolved;
}
