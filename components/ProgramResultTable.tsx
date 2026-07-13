import { DeficitBadge } from "./DeficitBadge";
import { SourceLink } from "./SourceLink";
import { GSAT_114_FIVE_STANDARDS } from "@/lib/subjects";
import type {
  EvaluationResult,
  Program,
  RequirementResult,
  RuleResult,
} from "@/lib/types";

type ProgramResultTableProps = {
  evaluations: readonly EvaluationResult[];
  tone: "passed" | "near";
  emptyMessage: string;
  startIndex?: number;
};

type UnsupportedProgramTableProps = {
  programs: readonly Program[];
  emptyMessage: string;
  startIndex?: number;
};

function RuleSummary({ result }: { result: RuleResult }) {
  return (
    <li className={result.passed ? "rule-line passed" : "rule-line failed"}>
      <span className="rule-order">第 {result.rule.order} 關</span>
      <span className="rule-name">{result.rule.label}</span>
      <span className="rule-score">
        你的 <b>{result.userScore}</b>
        <i aria-hidden="true">/</i>
        門檻 {result.minScore}
      </span>
      <span className="rule-status">
        {result.passed ? "通過" : `差 ${result.deficit}`}
      </span>
    </li>
  );
}

function requirementThresholdLabel(result: RequirementResult): string {
  const { requirement } = result;

  if (requirement.subject === "英聽") {
    return requirement.standard;
  }

  const grade =
    GSAT_114_FIVE_STANDARDS[requirement.subject][requirement.standard];
  return `${requirement.standard}（${grade} 級分）`;
}

function RequirementSummary({ result }: { result: RequirementResult }) {
  const isListening = result.requirement.subject === "英聽";
  return (
    <li className={result.passed ? "rule-line passed" : "rule-line failed"}>
      <span className="rule-order">檢定</span>
      <span className="rule-name">
        {result.requirement.subject}{result.requirement.standard}
      </span>
      <span className="rule-score">
        {isListening ? "已換算等級" : <>你的 <b>{result.userScore}</b></>}
        <i aria-hidden="true">/</i>
        門檻 {requirementThresholdLabel(result)}
      </span>
      <span className="rule-status">
        {result.passed ? "通過" : isListening ? "未達" : `差 ${result.deficit}`}
      </span>
    </li>
  );
}

function BoostPlan({ evaluation }: { evaluation: EvaluationResult }) {
  const plan = evaluation.nearestBoost[0];
  if (!plan) {
    return (
      <p className="boost-copy unavailable">
        在各科成績上限內，沒有可行的補分組合。
      </p>
    );
  }

  return (
    <div className="boost-plan">
      <span className="boost-label">最省力方向</span>
      <p className="boost-copy">
        {plan.changes.map((change, index) => (
          <span key={change.subject}>
            {index > 0 ? "、" : ""}
            <b>{change.subject}</b> +{change.points}
          </span>
        ))}
      </p>
      {evaluation.nearestBoost.length > 1 ? (
        <span className="boost-alternatives">
          另有 {evaluation.nearestBoost.length - 1} 種同分方案
        </span>
      ) : null}
    </div>
  );
}

export function ProgramResultTable({
  evaluations,
  tone,
  emptyMessage,
  startIndex = 0,
}: ProgramResultTableProps) {
  if (evaluations.length === 0) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  return (
    <div className="program-list">
      {evaluations.map((evaluation, index) => (
        <article
          className={`program-card ${tone}`}
          key={evaluation.program.programCode}
        >
          <div
            className="program-rank"
            aria-label={`第 ${startIndex + index + 1} 筆`}
          >
            {String(startIndex + index + 1).padStart(2, "0")}
          </div>
          <div className="program-main">
            <div className="program-heading">
              <div>
                <div className="school-line">
                  <span>{evaluation.program.schoolName}</span>
                  <span className="program-code">
                    {evaluation.program.programCode}
                  </span>
                </div>
                <h3>{evaluation.program.programName}</h3>
                {evaluation.screeningVariant ? (
                  <p className="screening-variant-note">
                    {evaluation.screeningVariant.label}・招生名額 {evaluation.screeningVariant.quota}
                  </p>
                ) : null}
              </div>
              <div className="program-actions">
                {tone === "passed" ? (
                  <span className="pass-badge">可能通過</span>
                ) : (
                  <DeficitBadge
                    points={evaluation.nearestBoost[0]?.totalPoints ?? 0}
                  />
                )}
                <SourceLink
                  compact
                  href={evaluation.program.source.reportHtmlUrl}
                />
              </div>
            </div>

            <ul className="rule-list" aria-label="逐關篩選結果">
              {(tone === "passed"
                ? evaluation.requirementResults
                : evaluation.failedRequirements
              ).map((result) => (
                <RequirementSummary
                  key={`${evaluation.program.programCode}-requirement-${result.requirement.subject}`}
                  result={result}
                />
              ))}
              {(tone === "passed"
                ? evaluation.ruleResults
                : evaluation.failedRules
              ).map((result) => (
                <RuleSummary
                  key={`${evaluation.program.programCode}-${result.rule.order}`}
                  result={result}
                />
              ))}
            </ul>

            {tone === "near" ? <BoostPlan evaluation={evaluation} /> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

export function UnsupportedProgramTable({
  programs,
  emptyMessage,
  startIndex = 0,
}: UnsupportedProgramTableProps) {
  if (programs.length === 0) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  return (
    <div className="program-list">
      {programs.map((program, index) => {
        const requiresSpecialScreening = program.reviewReasons?.some(
          (reason) => reason.startsWith("需特殊檢定"),
        );
        const requiresGenderSelection =
          (program.screeningVariants?.length ?? 0) > 0;

        return (
          <article
            className="program-card needs-review"
            key={program.programCode}
          >
            <div
              className="program-rank"
              aria-label={`第 ${startIndex + index + 1} 筆`}
            >
              {String(startIndex + index + 1).padStart(2, "0")}
            </div>
            <div className="program-main">
              <div className="program-heading">
                <div>
                  <div className="school-line">
                    <span>{program.schoolName}</span>
                    <span className="program-code">{program.programCode}</span>
                  </div>
                  <h3>{program.programName}</h3>
                </div>
                <div className="program-actions">
                  <span className="review-badge">
                    {requiresGenderSelection
                      ? "需選性別組別"
                      : requiresSpecialScreening
                        ? "需特殊檢定"
                        : "資料待確認"}
                  </span>
                  <SourceLink
                    compact
                    href={
                      program.source.programDetailUrl ??
                      program.source.reportHtmlUrl
                    }
                  />
                </div>
              </div>

              <div className="review-reasons">
                <b>
                  {requiresGenderSelection
                    ? "官方分列男、女生名額與門檻；請返回上頁選擇招生性別組別："
                    : requiresSpecialScreening
                      ? "需特殊檢定，無法只用一般學測成績完整判定："
                      : "目前無法安全自動判斷："}
                </b>
                {requiresGenderSelection ? (
                  <ul aria-label="官方性別分列篩選門檻">
                    {program.screeningVariants?.map((variant) => (
                      <li key={variant.applicantGender}>
                        {variant.label}：名額 {variant.quota}；
                        {variant.screeningRules
                          .map((rule) => `${rule.label} ${rule.minScore}`)
                          .join("、")}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <>
                    {program.additionalScreeningRules?.length ? (
                      <ul aria-label="已錄入的官方最低篩選分數">
                        {program.additionalScreeningRules.map((rule) => (
                          <li key={`${rule.label}-${rule.minScore}`}>
                            {rule.label}：{rule.minScore}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <ul>
                      {(program.reviewReasons?.length
                        ? program.reviewReasons
                        : ["官方最低級分資料仍待人工確認"]
                      ).map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
