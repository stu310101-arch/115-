export const SUBJECTS = [
  "國文",
  "英文",
  "數A",
  "數B",
  "社會",
  "自然",
  "英聽",
] as const;

export type Subject = (typeof SUBJECTS)[number];

export type GroupTag = "自然組" | "社會組";

export const PROGRAM_DATA_STATUSES = ["complete", "needs-review"] as const;

/** Whether all official fields required for a safe pass/fail result were parsed. */
export type ProgramDataStatus = (typeof PROGRAM_DATA_STATUSES)[number];

export const EVALUATION_SUPPORT_STATUSES = [
  "supported",
  "unsupported",
] as const;

export type EvaluationSupportStatus =
  (typeof EVALUATION_SUPPORT_STATUSES)[number];

export const OFFICIAL_THRESHOLD_STATUSES = ["available", "dash"] as const;

/** Whether the official minimum-threshold table publishes numeric values. */
export type OfficialThresholdStatus =
  (typeof OFFICIAL_THRESHOLD_STATUSES)[number];

export const APPLICANT_GENDERS = ["male", "female"] as const;

export type ApplicantGender = (typeof APPLICANT_GENDERS)[number];

export const REQUIREMENT_STANDARDS = [
  "頂標",
  "前標",
  "均標",
  "後標",
  "底標",
] as const;

export type RequirementStandard = (typeof REQUIREMENT_STANDARDS)[number];

export const LISTENING_STANDARDS = ["A級", "B級", "C級"] as const;

export type ListeningStandard = (typeof LISTENING_STANDARDS)[number];

/** An official subject threshold converted with the 115 GSAT five standards. */
export type SubjectRequirement =
  | {
      subject: Exclude<Subject, "英聽">;
      standard: RequirementStandard;
      minScore: number;
      rawText: string;
    }
  | {
      subject: "英聽";
      standard: ListeningStandard;
      minScore: number;
      rawText: string;
    };

export type ScreeningRule = {
  order: number;
  label: string;
  subjects: Subject[];
  minScore: number;
  rawText: string;
};

export type ProgramScreeningVariant = {
  applicantGender: ApplicantGender;
  label: string;
  quota: number;
  screeningRules: ScreeningRule[];
};

/** A verified threshold that cannot yet be evaluated from ordinary GSAT inputs alone. */
export type AdditionalScreeningRule = {
  label: string;
  /** `null` is the official `--`, not a missing or zero-point threshold. */
  minScore: number | null;
  rawText: string;
};

/** A quota-bearing official subgroup whose thresholds require a special score type. */
export type SpecialScreeningGroup = {
  label: string;
  quota: number;
  rules: AdditionalScreeningRule[];
};

export type ProgramSource = {
  collegeListUrl: string;
  reportHtmlUrl: string;
  reportImageUrl: string;
  /** Official 115 application catalog page for this exact program. */
  programDetailUrl?: string;
};

export type Program = {
  year: 115;
  schoolId: string;
  schoolName: string;
  programCode: string;
  programName: string;
  quota?: number;
  groupTags: GroupTag[];
  departmentKeywords: string[];
  requirements?: SubjectRequirement[];
  screeningRules: ScreeningRule[];
  /** Official rows that share one program code but use gender-specific quotas and thresholds. */
  screeningVariants?: ProgramScreeningVariant[];
  /** Verified special thresholds retained for display while automatic evaluation is unsupported. */
  additionalScreeningRules?: AdditionalScreeningRule[];
  /** Official APCS individual application requirements; null means official `--`. */
  apcsConceptMin?: number | null;
  apcsPracticeMin?: number | null;
  /** Official APCS first-stage screening multipliers; null means official `--`. */
  apcsConceptMultiplier?: number | null;
  apcsPracticeMultiplier?: number | null;
  /** Distinguishes an official `--` result from unparsed or missing source data. */
  officialThresholdStatus?: OfficialThresholdStatus;
  /** Official major/instrument subgroups with separate quotas and special thresholds. */
  specialScreeningGroups?: SpecialScreeningGroup[];
  source: ProgramSource;
  /**
   * New official imports always set both fields. They are optional only so the
   * original hand-curated 115 snapshot can remain readable during migration.
   */
  dataStatus?: ProgramDataStatus;
  evaluationSupport?: EvaluationSupportStatus;
  reviewReasons?: string[];
  /** Legacy mirror retained for existing UI/data consumers. */
  verified: boolean;
};

export type UserScores = Partial<Record<Subject, number>>;

export const APCS_SCORE_PARTS = ["concept", "practice"] as const;

export type ApcsScorePart = (typeof APCS_SCORE_PARTS)[number];

/** APCS levels explicitly entered by the user. Missing means unanswered, not zero. */
export type ApcsScores = Partial<Record<ApcsScorePart, number>>;

export type ApcsRuleResult = {
  label: string;
  parts: ApcsScorePart[];
  userScore: number;
  minScore: number;
  deficit: number;
  passed: boolean;
};

export type ApcsEvaluationResult = {
  providedParts: ApcsScorePart[];
  missingParts: ApcsScorePart[];
  complete: boolean;
  /** `null` means the entered APCS data is not yet complete enough to decide. */
  passed: boolean | null;
  ruleResults: ApcsRuleResult[];
  failedRules: ApcsRuleResult[];
};

export type RuleResult = {
  rule: ScreeningRule;
  userScore: number;
  minScore: number;
  deficit: number;
  passed: boolean;
};

export type RequirementResult = {
  requirement: SubjectRequirement;
  userScore: number;
  minScore: number;
  deficit: number;
  passed: boolean;
};

export type SubjectChange = {
  subject: Subject;
  points: number;
  from: number;
  to: number;
};

/** One minimum-total-points way to make every screening rule pass. */
export type SubjectBoost = {
  totalPoints: number;
  changes: SubjectChange[];
};

export type EvaluationResult = {
  passed: boolean;
  /** Result of the GSAT requirements and screening rules before optional APCS. */
  academicPassed: boolean;
  program: Program;
  screeningVariant?: ProgramScreeningVariant;
  ruleResults: RuleResult[];
  failedRules: RuleResult[];
  requirementResults: RequirementResult[];
  failedRequirements: RequirementResult[];
  /** Sum of failed rule/requirement deficits; overlapping constraints may count the same point. */
  totalDeficit: number;
  /** Subjects used by this program that are absent (or undefined) in UserScores. */
  missingSubjects: Subject[];
  /** Up to five tied, minimum-total-points boost plans. */
  nearestBoost: SubjectBoost[];
  /** Present only for programs with official APCS requirements. */
  apcsEvaluation?: ApcsEvaluationResult;
};
