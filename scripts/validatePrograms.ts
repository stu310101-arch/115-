import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Program } from "../lib/types";

const VALID_SUBJECTS = new Set([
  "國文",
  "英文",
  "數A",
  "數B",
  "社會",
  "自然",
  "英聽",
]);
const VALID_REQUIREMENT_SUBJECTS = new Set([
  "國文",
  "英文",
  "數A",
  "數B",
  "社會",
  "自然",
  "英聽",
]);
const VALID_REQUIREMENT_STANDARDS = new Set([
  "頂標",
  "前標",
  "均標",
  "後標",
  "底標",
  "A級",
  "B級",
  "C級",
]);
const VALID_GROUP_TAGS = new Set(["自然組", "社會組"]);
const VALID_DATA_STATUSES = new Set(["complete", "needs-review"]);
const VALID_EVALUATION_SUPPORT = new Set(["supported", "unsupported"]);
const SOURCE_URL_FIELDS = [
  "collegeListUrl",
  "reportHtmlUrl",
  "reportImageUrl",
] as const;

export type ValidationIssue = Readonly<{
  path: string;
  message: string;
}>;

export type ProgramsValidationReport = Readonly<{
  valid: boolean;
  programCount: number;
  schoolCount: number;
  supportedCount: number;
  unsupportedCount: number;
  /** Legacy aliases retained for the existing CLI/tests. */
  verifiedCount: number;
  unverifiedCount: number;
  errors: readonly ValidationIssue[];
  warnings: readonly ValidationIssue[];
}>;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isHttpUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function addNumericScoreError(
  value: unknown,
  maximum: number,
  addError: (field: string, message: string) => void,
  field: string,
): void {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value)
  ) {
    addError(field, "必須是有限整數");
  } else if (value < 0 || value > maximum) {
    addError(field, `必須介於 0 與 ${maximum} 之間`);
  }
}

function validateScreeningRule(
  rule: unknown,
  rulePath: string,
  addError: (field: string, message: string) => void,
): void {
  if (!isRecord(rule)) {
    addError(rulePath, "每筆 screeningRule 必須是物件");
    return;
  }
  if (
    typeof rule.order !== "number" ||
    !Number.isInteger(rule.order) ||
    rule.order < 1
  ) {
    addError(`${rulePath}.order`, "order 必須是大於 0 的整數");
  }
  if (!isNonEmptyString(rule.label)) {
    addError(`${rulePath}.label`, "label 必須是非空字串");
  }
  if (typeof rule.rawText !== "string") {
    addError(`${rulePath}.rawText`, "rawText 必須是字串");
  }
  if (!Array.isArray(rule.subjects) || rule.subjects.length === 0) {
    addError(`${rulePath}.subjects`, "subjects 至少要有一個科目");
    return;
  }

  const seenSubjects = new Set<unknown>();
  rule.subjects.forEach((subject, subjectIndex) => {
    if (typeof subject !== "string" || !VALID_SUBJECTS.has(subject)) {
      addError(
        `${rulePath}.subjects[${subjectIndex}]`,
        `未知科目：${String(subject)}`,
      );
    } else if (seenSubjects.has(subject)) {
      addError(
        `${rulePath}.subjects[${subjectIndex}]`,
        `同一規則不可重複計算科目：${subject}`,
      );
    }
    seenSubjects.add(subject);
  });
  addNumericScoreError(
    rule.minScore,
    rule.subjects.length * 15,
    addError,
    `${rulePath}.minScore`,
  );
}

function validateAdditionalScreeningRule(
  rule: unknown,
  rulePath: string,
  addError: (field: string, message: string) => void,
): void {
  if (!isRecord(rule)) {
    addError(rulePath, "每筆特殊篩選規則必須是物件");
    return;
  }
  if (!isNonEmptyString(rule.label)) {
    addError(`${rulePath}.label`, "label 必須是非空字串");
  }
  if (
    typeof rule.minScore !== "number" ||
    !Number.isFinite(rule.minScore) ||
    rule.minScore < 0
  ) {
    addError(`${rulePath}.minScore`, "minScore 必須是非負數字");
  }
  if (typeof rule.rawText !== "string") {
    addError(`${rulePath}.rawText`, "rawText 必須是字串");
  }
}

/**
 * 驗證完整官方校系資料。待確認門檻不算結構錯誤，且仍須保留讓使用者搜尋；
 * 只有 `evaluationSupport: supported` 的資料可以交給判斷函式。
 */
export function validatePrograms(input: unknown): ProgramsValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!Array.isArray(input)) {
    return {
      valid: false,
      programCount: 0,
      schoolCount: 0,
      supportedCount: 0,
      unsupportedCount: 0,
      verifiedCount: 0,
      unverifiedCount: 0,
      errors: [{ path: "$", message: "根節點必須是校系陣列" }],
      warnings,
    };
  }

  const seenProgramCodes = new Map<string, number>();
  const schoolIds = new Set<string>();
  let supportedCount = 0;
  let unsupportedCount = 0;

  input.forEach((candidate, index) => {
    const basePath = `$[${index}]`;
    const addError = (field: string, message: string) => {
      errors.push({ path: `${basePath}.${field}`, message });
    };

    if (!isRecord(candidate)) {
      errors.push({ path: basePath, message: "每筆校系資料必須是物件" });
      return;
    }

    if (candidate.year !== 114) addError("year", "year 必須是數字 114");

    for (const field of [
      "schoolId",
      "schoolName",
      "programCode",
      "programName",
    ] as const) {
      if (!isNonEmptyString(candidate[field])) {
        addError(field, `${field} 必須是非空字串`);
      }
    }

    if (isNonEmptyString(candidate.schoolId)) {
      const schoolId = candidate.schoolId.trim();
      schoolIds.add(schoolId);
      if (!/^\d{3}$/.test(schoolId)) {
        addError("schoolId", "schoolId 必須是三位數校碼");
      }
      if (
        isNonEmptyString(candidate.programCode) &&
        !candidate.programCode.trim().startsWith(schoolId)
      ) {
        addError("programCode", "校系代碼必須以 schoolId 開頭");
      }
    }

    if (isNonEmptyString(candidate.programCode)) {
      const code = candidate.programCode.trim();
      if (!/^\d{6}$/.test(code)) {
        addError("programCode", "programCode 必須是六位數校系代碼");
      }
      const firstIndex = seenProgramCodes.get(code);
      if (firstIndex !== undefined) {
        addError(
          "programCode",
          `校系代碼 ${code} 重複，首次出現在 $[${firstIndex}]`,
        );
      } else {
        seenProgramCodes.set(code, index);
      }
    }

    if (
      candidate.quota !== undefined &&
      (typeof candidate.quota !== "number" ||
        !Number.isInteger(candidate.quota) ||
        candidate.quota < 0)
    ) {
      addError("quota", "quota 必須是非負整數");
    }

    if (!Array.isArray(candidate.groupTags) || candidate.groupTags.length === 0) {
      addError("groupTags", "groupTags 至少要有自然組或社會組其中一項");
    } else {
      candidate.groupTags.forEach((tag, tagIndex) => {
        if (typeof tag !== "string" || !VALID_GROUP_TAGS.has(tag)) {
          addError(`groupTags[${tagIndex}]`, "只能包含自然組或社會組");
        }
      });
    }

    if (
      !Array.isArray(candidate.departmentKeywords) ||
      candidate.departmentKeywords.some((keyword) => !isNonEmptyString(keyword))
    ) {
      addError("departmentKeywords", "必須是非空字串組成的陣列");
    }

    const evaluationSupport = candidate.evaluationSupport;
    const legacySupported =
      evaluationSupport === undefined && candidate.verified === true;
    const isSupported = evaluationSupport === "supported" || legacySupported;
    if (
      evaluationSupport !== undefined &&
      (typeof evaluationSupport !== "string" ||
        !VALID_EVALUATION_SUPPORT.has(evaluationSupport))
    ) {
      addError(
        "evaluationSupport",
        "evaluationSupport 只能是 supported 或 unsupported",
      );
    }
    if (
      candidate.dataStatus !== undefined &&
      (typeof candidate.dataStatus !== "string" ||
        !VALID_DATA_STATUSES.has(candidate.dataStatus))
    ) {
      addError("dataStatus", "dataStatus 只能是 complete 或 needs-review");
    }

    if (typeof candidate.verified !== "boolean") {
      addError("verified", "verified 必須明確為 boolean");
    }
    if (evaluationSupport === "supported") {
      supportedCount += 1;
      if (candidate.verified !== true) {
        addError("verified", "supported 資料的 verified 必須為 true");
      }
      if (candidate.dataStatus !== "complete") {
        addError("dataStatus", "supported 資料的 dataStatus 必須為 complete");
      }
    } else if (evaluationSupport === "unsupported") {
      unsupportedCount += 1;
      if (candidate.verified !== false) {
        addError("verified", "unsupported 資料的 verified 必須為 false");
      }
      if (candidate.dataStatus !== "needs-review") {
        addError(
          "dataStatus",
          "unsupported 資料的 dataStatus 必須為 needs-review",
        );
      }
      warnings.push({
        path: `${basePath}.evaluationSupport`,
        message: "官方校系仍可搜尋，但門檻待確認，禁止自動判斷",
      });
    } else if (candidate.verified === true) {
      supportedCount += 1;
    } else if (candidate.verified === false) {
      unsupportedCount += 1;
      warnings.push({
        path: `${basePath}.verified`,
        message: "此筆仍可搜尋，但門檻待確認，禁止自動判斷",
      });
    }

    const hasScreeningVariants =
      Array.isArray(candidate.screeningVariants) &&
      candidate.screeningVariants.length > 0;

    if (!Array.isArray(candidate.screeningRules)) {
      addError("screeningRules", "screeningRules 必須是 rules array");
    } else {
      if (
        isSupported &&
        candidate.screeningRules.length === 0 &&
        (!Array.isArray(candidate.requirements) || candidate.requirements.length === 0) &&
        !hasScreeningVariants
      ) {
        addError(
          "screeningRules",
          "可自動判斷的校系至少要有一筆可信篩選規則",
        );
      }
      candidate.screeningRules.forEach((rule, ruleIndex) => {
        validateScreeningRule(
          rule,
          `screeningRules[${ruleIndex}]`,
          addError,
        );
      });
    }

    if (candidate.screeningVariants !== undefined) {
      if (!Array.isArray(candidate.screeningVariants)) {
        addError("screeningVariants", "screeningVariants 必須是陣列");
      } else {
        const seenGenders = new Set<unknown>();
        let variantQuota = 0;
        candidate.screeningVariants.forEach((variant, variantIndex) => {
          const path = `screeningVariants[${variantIndex}]`;
          if (!isRecord(variant)) {
            addError(path, "每筆性別分列規則必須是物件");
            return;
          }
          if (variant.applicantGender !== "male" && variant.applicantGender !== "female") {
            addError(`${path}.applicantGender`, "只能是 male 或 female");
          } else if (seenGenders.has(variant.applicantGender)) {
            addError(`${path}.applicantGender`, "同一性別組別不可重複");
          }
          seenGenders.add(variant.applicantGender);
          if (!isNonEmptyString(variant.label)) {
            addError(`${path}.label`, "label 必須是非空字串");
          }
          if (
            typeof variant.quota !== "number" ||
            !Number.isInteger(variant.quota) ||
            variant.quota < 0
          ) {
            addError(`${path}.quota`, "quota 必須是非負整數");
          } else {
            variantQuota += variant.quota;
          }
          if (!Array.isArray(variant.screeningRules) || variant.screeningRules.length === 0) {
            addError(`${path}.screeningRules`, "每個性別組別至少要有一筆可信篩選規則");
          } else {
            variant.screeningRules.forEach((rule, ruleIndex) => {
              validateScreeningRule(
                rule,
                `${path}.screeningRules[${ruleIndex}]`,
                addError,
              );
            });
          }
        });
        if (
          candidate.screeningVariants.length > 0 &&
          Array.isArray(candidate.screeningRules) &&
          candidate.screeningRules.length > 0
        ) {
          addError("screeningRules", "有性別分列規則時不得保留共用篩選規則");
        }
        if (typeof candidate.quota === "number" && variantQuota !== candidate.quota) {
          addError("screeningVariants", "各性別組別名額加總必須等於校系招生名額");
        }
      }
    }

    if (candidate.additionalScreeningRules !== undefined) {
      if (!Array.isArray(candidate.additionalScreeningRules)) {
        addError("additionalScreeningRules", "additionalScreeningRules 必須是陣列");
      } else {
        candidate.additionalScreeningRules.forEach((rule, ruleIndex) => {
          validateAdditionalScreeningRule(
            rule,
            `additionalScreeningRules[${ruleIndex}]`,
            addError,
          );
        });
      }
    }

    if (candidate.specialScreeningGroups !== undefined) {
      if (
        !Array.isArray(candidate.specialScreeningGroups) ||
        candidate.specialScreeningGroups.length === 0
      ) {
        addError("specialScreeningGroups", "specialScreeningGroups 必須是非空陣列");
      } else {
        const seenLabels = new Set<string>();
        let groupQuota = 0;
        candidate.specialScreeningGroups.forEach((group, groupIndex) => {
          const path = `specialScreeningGroups[${groupIndex}]`;
          if (!isRecord(group)) {
            addError(path, "每筆特殊篩選分組必須是物件");
            return;
          }
          if (!isNonEmptyString(group.label)) {
            addError(`${path}.label`, "label 必須是非空字串");
          } else if (seenLabels.has(group.label)) {
            addError(`${path}.label`, "同一校系的特殊篩選分組名稱不可重複");
          } else {
            seenLabels.add(group.label);
          }
          if (
            typeof group.quota !== "number" ||
            !Number.isInteger(group.quota) ||
            group.quota < 0
          ) {
            addError(`${path}.quota`, "quota 必須是非負整數");
          } else {
            groupQuota += group.quota;
          }
          if (!Array.isArray(group.rules) || group.rules.length === 0) {
            addError(`${path}.rules`, "每個特殊篩選分組至少要有一筆門檻");
          } else {
            group.rules.forEach((rule, ruleIndex) => {
              validateAdditionalScreeningRule(
                rule,
                `${path}.rules[${ruleIndex}]`,
                addError,
              );
            });
          }
        });
        if (typeof candidate.quota === "number" && groupQuota !== candidate.quota) {
          addError(
            "specialScreeningGroups",
            "各特殊篩選分組名額加總必須等於校系招生名額",
          );
        }
      }
    }

    if (candidate.requirements !== undefined) {
      if (!Array.isArray(candidate.requirements)) {
        addError("requirements", "requirements 必須是陣列");
      } else {
        candidate.requirements.forEach((requirement, requirementIndex) => {
          const path = `requirements[${requirementIndex}]`;
          if (!isRecord(requirement)) {
            addError(path, "每筆 requirement 必須是物件");
            return;
          }
          if (
            typeof requirement.subject !== "string" ||
            !VALID_REQUIREMENT_SUBJECTS.has(requirement.subject)
          ) {
            addError(`${path}.subject`, "未知的學測檢定科目");
          }
          const isListening = requirement.subject === "英聽";
          const validStandard =
            typeof requirement.standard === "string" &&
            VALID_REQUIREMENT_STANDARDS.has(requirement.standard) &&
            (isListening
              ? ["A級", "B級", "C級"].includes(requirement.standard)
              : !["A級", "B級", "C級"].includes(requirement.standard));
          if (!validStandard) {
            addError(`${path}.standard`, "檢定科目與標準不相符");
          }
          addNumericScoreError(
            requirement.minScore,
            isListening ? 3 : 15,
            addError,
            `${path}.minScore`,
          );
          if (typeof requirement.rawText !== "string") {
            addError(`${path}.rawText`, "rawText 必須是字串");
          }
        });
      }
    }

    if (!isRecord(candidate.source)) {
      addError("source", "source 必須是物件，且包含三個官方網址");
    } else {
      for (const field of SOURCE_URL_FIELDS) {
        if (!isHttpUrl(candidate.source[field])) {
          addError(
            `source.${field}`,
            `${field} 必須是存在且格式正確的 http(s) URL`,
          );
        }
      }
    }

    if (candidate.reviewReasons !== undefined) {
      if (
        !Array.isArray(candidate.reviewReasons) ||
        candidate.reviewReasons.some((reason) => !isNonEmptyString(reason))
      ) {
        addError("reviewReasons", "reviewReasons 必須是非空字串陣列");
      } else if (evaluationSupport === "unsupported" && candidate.reviewReasons.length === 0) {
        addError("reviewReasons", "待確認資料至少要說明一個原因");
      }
    }
  });

  return {
    valid: errors.length === 0,
    programCount: input.length,
    schoolCount: schoolIds.size,
    supportedCount,
    unsupportedCount,
    verifiedCount: supportedCount,
    unverifiedCount: unsupportedCount,
    errors,
    warnings,
  };
}

async function main(): Promise<void> {
  const filePath = resolve(process.argv[2] ?? "data/programs_114.json");
  let input: unknown;
  try {
    input = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    console.error(
      `無法讀取或解析 ${filePath}:`,
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
    return;
  }

  const report = validatePrograms(input);
  for (const issue of report.errors) console.error(`錯誤 ${issue.path}: ${issue.message}`);
  for (const issue of report.warnings) console.warn(`警告 ${issue.path}: ${issue.message}`);
  console.log(
    `校系 ${report.programCount} 筆／學校 ${report.schoolCount} 所；` +
      `可判斷 ${report.supportedCount} 筆；待確認 ${report.unsupportedCount} 筆`,
  );
  if (!report.valid) {
    console.error(`資料驗證失敗，共 ${report.errors.length} 個錯誤`);
    process.exitCode = 1;
  } else {
    console.log("資料驗證通過");
  }
}

const entryUrl = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (entryUrl === import.meta.url) void main();

export type ValidatedProgram = Program;
