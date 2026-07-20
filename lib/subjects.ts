import {
  SUBJECTS,
  type ListeningStandard,
  type RequirementStandard,
  type Subject,
  type UserScores,
} from "./types.ts";

export { SUBJECTS };

export const SUBJECT_MAX_SCORE = 15;

export const SUBJECT_MAX_SCORES: Readonly<Record<Subject, number>> = {
  國文: 15,
  英文: 15,
  數A: 15,
  數B: 15,
  社會: 15,
  自然: 15,
  英聽: 3,
};

export const SUBJECT_LABELS: Readonly<Record<Subject, string>> = {
  國文: "國文",
  英文: "英文",
  數A: "數A",
  數B: "數B",
  社會: "社會",
  自然: "自然",
  英聽: "英聽",
};

export const GSAT_115_FIVE_STANDARDS: Readonly<
  Record<Exclude<Subject, "英聽">, Readonly<Record<RequirementStandard, number>>>
> = {
  國文: { 頂標: 13, 前標: 12, 均標: 10, 後標: 9, 底標: 7 },
  英文: { 頂標: 13, 前標: 11, 均標: 8, 後標: 5, 底標: 3 },
  數A: { 頂標: 12, 前標: 10, 均標: 8, 後標: 5, 底標: 4 },
  數B: { 頂標: 11, 前標: 9, 均標: 5, 後標: 3, 底標: 2 },
  社會: { 頂標: 13, 前標: 12, 均標: 10, 後標: 8, 底標: 7 },
  自然: { 頂標: 13, 前標: 12, 均標: 9, 後標: 7, 底標: 5 },
};

export function scoreFor115Standard(
  subject: Exclude<Subject, "英聽">,
  standard: RequirementStandard,
): number {
  return GSAT_115_FIVE_STANDARDS[subject][standard];
}

export const ENGLISH_LISTENING_LEVEL_SCORES: Readonly<
  Record<ListeningStandard, number>
> = { A級: 3, B級: 2, C級: 1 };

export function scoreForEnglishListening(
  standard: ListeningStandard,
): number {
  return ENGLISH_LISTENING_LEVEL_SCORES[standard];
}

/** A numeric zero is an entered score. An absent or undefined value is not. */
export function hasSubjectScore(scores: UserScores, subject: Subject): boolean {
  return typeof scores[subject] === "number";
}

/** Missing subjects contribute zero to screening-rule sums. */
export function getSubjectScore(scores: UserScores, subject: Subject): number {
  return hasSubjectScore(scores, subject) ? (scores[subject] as number) : 0;
}

export function assertValidUserScores(scores: UserScores): void {
  for (const subject of SUBJECTS) {
    const score = scores[subject];

    if (score === undefined) {
      continue;
    }

    if (
      typeof score !== "number" ||
      !Number.isFinite(score) ||
      !Number.isInteger(score) ||
      score < 0 ||
      score > SUBJECT_MAX_SCORES[subject]
    ) {
      throw new RangeError(
        `${subject}成績必須是 0 到 ${SUBJECT_MAX_SCORES[subject]} 的整數`,
      );
    }
  }
}
