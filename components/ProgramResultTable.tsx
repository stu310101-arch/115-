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
  items: readonly UnsupportedProgramItem[];
  emptyMessage: string;
  startIndex?: number;
};

export type UnsupportedProgramItem = {
  program: Program;
  academicEvaluation?: EvaluationResult;
};

function requiresSpecialScreening(program: Program): boolean {
  return (
    program.reviewReasons?.some((reason) =>
      reason.startsWith("需特殊檢定"),
    ) ?? false
  );
}

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
          className={`program-card ${tone}${
            requiresSpecialScreening(evaluation.program)
              ? " special-screening-result"
              : ""
          }`}
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
                {requiresSpecialScreening(evaluation.program) ? (
                  <span className="review-badge special">
                    {tone === "passed"
                      ? "學測達標・須特殊檢定"
                      : "學測未達・須特殊檢定"}
                  </span>
                ) : tone === "passed" ? (
                  <span className="pass-badge">可能通過</span>
                ) : (
                  <DeficitBadge
                    points={evaluation.nearestBoost[0]?.totalPoints ?? 0}
                  />
                )}
                {requiresSpecialScreening(evaluation.program) &&
                tone === "near" ? (
                  <DeficitBadge
                    points={evaluation.nearestBoost[0]?.totalPoints ?? 0}
                  />
                ) : null}
                <SourceLink
                  compact
                  href={
                    evaluation.program.source.programDetailUrl ??
                    evaluation.program.source.reportHtmlUrl
                  }
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

            {requiresSpecialScreening(evaluation.program) ? (
              <div className="special-result-warning" role="note">
                <div>
                  <b>
                    {tone === "passed"
                      ? "學測門檻已達，但尚未代表完整通過。"
                      : "此處僅計算可確認的學測門檻。"}
                  </b>
                  <p>
                    本校系另須特殊檢定／證照；請務必使用卡片右上角「官方原表」連結確認資格、採計方式與最低標準。
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

export function UnsupportedProgramTable({
  items,
  emptyMessage,
  startIndex = 0,
}: UnsupportedProgramTableProps) {
  if (items.length === 0) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  return (
    <div className="program-list">
      {items.map(({ program, academicEvaluation }, index) => {
        const requiresSpecialScreening = program.reviewReasons?.some(
          (reason) => reason.startsWith("需特殊檢定"),
        );
        const requiresGenderSelection =
          (program.screeningVariants?.length ?? 0) > 0;

        return (
          <article
            className={`program-card needs-review${requiresSpecialScreening ? " special-screening-result" : ""}`}
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
                  <span
                    className={`review-badge${requiresGenderSelection ? " incomplete" : requiresSpecialScreening ? " special" : ""}`}
                  >
                    {requiresGenderSelection
                      ? "需選性別組別"
                      : requiresSpecialScreening
                        ? "須特殊檢定"
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

              {requiresSpecialScreening ? (
                <div className="special-evaluation-panel" role="note">
                  <div className="special-evaluation-heading">
                    <div>
                      <span>學測門檻試算</span>
                      <strong>
                        {academicEvaluation
                          ? academicEvaluation.passed
                            ? "已達目前可試算門檻"
                            : academicEvaluation.nearestBoost[0]
                              ? `尚差最少 ${academicEvaluation.nearestBoost[0].totalPoints} 級分`
                              : "尚未達到門檻"
                          : "官方未列可獨立試算的學測最低級分"}
                      </strong>
                    </div>
                    {academicEvaluation ? (
                      <span
                        className={`academic-evaluation-status ${academicEvaluation.passed ? "passed" : "failed"}`}
                      >
                        {academicEvaluation.passed ? "學測已達" : "學測未達"}
                      </span>
                    ) : null}
                  </div>

                  {academicEvaluation ? (
                    <>
                      <ul className="rule-list" aria-label="可獨立試算的學測門檻">
                        {academicEvaluation.requirementResults.map((result) => (
                          <RequirementSummary
                            key={`${program.programCode}-academic-requirement-${result.requirement.subject}`}
                            result={result}
                          />
                        ))}
                        {academicEvaluation.ruleResults.map((result) => (
                          <RuleSummary
                            key={`${program.programCode}-academic-rule-${result.rule.order}-${result.rule.label}`}
                            result={result}
                          />
                        ))}
                      </ul>
                      {!academicEvaluation.passed ? (
                        <BoostPlan evaluation={academicEvaluation} />
                      ) : null}
                    </>
                  ) : (
                    <p className="special-evaluation-empty">
                      這筆官方資料沒有能和一般學測級分分開計算的最低門檻，因此不自行推估分數。
                    </p>
                  )}

                  <p className="special-evaluation-warning">
                    <b>重要：</b>
                    此校系另須特殊檢定／證照；上方學測試算不代表完整通過，特殊檢定資格與門檻請以官方資料為準。
                  </p>
                </div>
              ) : null}

              <div className="review-reasons">
                <b>
                  {requiresGenderSelection
                    ? "官方分列男、女生名額與門檻；請返回上頁選擇招生性別組別："
                    : requiresSpecialScreening
                      ? "其他官方條件與資料說明："
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
                ) : null}
                {program.additionalScreeningRules?.length ? (
                  <>
                    <p className="additional-screening-heading">
                      已錄入的官方最低篩選分數
                    </p>
                    <ul aria-label="已錄入的官方最低篩選分數">
                      {program.additionalScreeningRules.map((rule) => (
                        <li key={`${rule.label}-${rule.minScore}`}>
                          {rule.label}：{rule.minScore}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {program.specialScreeningGroups?.length ? (
                  <details className="special-screening-details">
                    <summary>
                      已錄入 {program.specialScreeningGroups.length} 個主修分組的名額與官方最低篩選分數
                    </summary>
                    <div className="special-screening-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th scope="col">主修</th>
                            <th scope="col">名額</th>
                            <th scope="col">最低篩選分數</th>
                          </tr>
                        </thead>
                        <tbody>
                          {program.specialScreeningGroups.map((group) => (
                            <tr key={group.label}>
                              <th scope="row">{group.label}</th>
                              <td>{group.quota}</td>
                              <td>
                                {group.rules
                                  .map((rule) => `${rule.label} ${rule.minScore}`)
                                  .join("、")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ) : null}
                {!requiresGenderSelection ? (
                  <ul>
                    {(program.reviewReasons?.length
                      ? program.reviewReasons
                      : ["官方最低級分資料仍待人工確認"]
                    ).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
