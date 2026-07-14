"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { SCHOOL_GROUPS } from "@/config/schoolGroups";
import {
  evaluateAcademicCriteria,
  evaluateProgram,
  supportsAcademicPartialEvaluation,
  supportsProgramEvaluation,
} from "@/lib/admission";
import { filterPrograms, type ProgramFilterCriteria } from "@/lib/filters";
import type { EvaluationResult, Program, UserScores } from "@/lib/types";
import { PageNavigation, RouteLink, SubpageHeader } from "./PageNavigation";
import { NavigationLoadingScreen } from "./NavigationLoadingProvider";
import {
  ProgramResultTable,
  UnsupportedProgramTable,
  type UnsupportedProgramItem,
} from "./ProgramResultTable";
import { SCORE_SUBJECTS } from "./ScoreForm";
import {
  queryStateToParams,
  restoreQueryState,
  saveQueryState,
  type AdmissionQueryState,
} from "./queryState";

type ResultsWorkspaceProps = {
  programs: Program[];
};

const RESULT_PAGE_SIZE = 20;

type ResultPaginationProps = {
  currentPage: number;
  label: string;
  onPageChange: (page: number) => void;
  totalItems: number;
};

function ResultPagination({
  currentPage,
  label,
  onPageChange,
  totalItems,
}: ResultPaginationProps) {
  const totalPages = Math.ceil(totalItems / RESULT_PAGE_SIZE);
  if (totalPages <= 1) return null;

  const start = currentPage * RESULT_PAGE_SIZE + 1;
  const end = Math.min(totalItems, start + RESULT_PAGE_SIZE - 1);

  return (
    <nav className="result-pagination" aria-label={`${label}分頁`}>
      <button
        disabled={currentPage === 0}
        onClick={() => onPageChange(currentPage - 1)}
        type="button"
      >
        ← 上一批
      </button>
      <span>
        第 {currentPage + 1}／{totalPages} 頁・顯示 {start}–{end} 筆
      </span>
      <button
        disabled={currentPage >= totalPages - 1}
        onClick={() => onPageChange(currentPage + 1)}
        type="button"
      >
        下一批 →
      </button>
    </nav>
  );
}

function toUserScores(query: AdmissionQueryState): UserScores {
  return SCORE_SUBJECTS.reduce<UserScores>((scores, subject) => {
    const raw = query.scores[subject].trim();
    if (raw !== "") scores[subject] = Number(raw);
    return scores;
  }, {});
}

function schoolPriority(schoolId: string): number {
  const index = SCHOOL_GROUPS.findIndex((group) =>
    group.schoolIds.includes(schoolId),
  );
  return index === -1 ? SCHOOL_GROUPS.length : index;
}

function comparePrograms(
  left: EvaluationResult,
  right: EvaluationResult,
): number {
  return (
    schoolPriority(left.program.schoolId) -
      schoolPriority(right.program.schoolId) ||
    left.program.schoolId.localeCompare(right.program.schoolId) ||
    left.program.programCode.localeCompare(right.program.programCode)
  );
}

function compareNear(left: EvaluationResult, right: EvaluationResult): number {
  const leftBoost = left.nearestBoost[0]?.totalPoints ?? Number.POSITIVE_INFINITY;
  const rightBoost = right.nearestBoost[0]?.totalPoints ?? Number.POSITIVE_INFINITY;
  return leftBoost - rightBoost || comparePrograms(left, right);
}

function compareProgramRecords(left: Program, right: Program): number {
  return (
    schoolPriority(left.schoolId) - schoolPriority(right.schoolId) ||
    left.schoolId.localeCompare(right.schoolId) ||
    left.programCode.localeCompare(right.programCode)
  );
}

function requiresSpecialScreening(program: Program): boolean {
  return (
    program.reviewReasons?.some((reason) =>
      reason.startsWith("需特殊檢定"),
    ) ?? false
  );
}

const subscribeToHydration = () => () => {};

export function ResultsWorkspace(props: ResultsWorkspaceProps) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );

  if (!hydrated) return <NavigationLoadingScreen />;

  return <HydratedResultsWorkspace {...props} />;
}

function HydratedResultsWorkspace({ programs }: ResultsWorkspaceProps) {
  const query = useMemo<AdmissionQueryState>(() => restoreQueryState(), []);
  const [passedPage, setPassedPage] = useState(0);
  const [nearPage, setNearPage] = useState(0);
  const [reviewPage, setReviewPage] = useState(0);

  useEffect(() => {
    saveQueryState(query);
  }, [query]);

  const evaluation = useMemo(() => {
    const criteria: ProgramFilterCriteria = {
      schoolGroupIds: query.schoolGroupIds,
      customSchoolIds: query.customSchoolIds,
      groupedProgramSelections: query.programSelections,
    };
    const matched = filterPrograms(programs, criteria);
    const userScores = toUserScores(query);
    const applicantGender = query.applicantGender || undefined;
    const supported = matched.filter((program) =>
      supportsProgramEvaluation(program, applicantGender),
    );
    const needsOfficialReviewPrograms = matched
      .filter(
        (program) => !supportsProgramEvaluation(program, applicantGender),
      )
      .sort(compareProgramRecords);
    const evaluated = supported.map((program) =>
      evaluateProgram(program, userScores, applicantGender),
    );
    const passed = evaluated.filter((result) => result.passed).sort(comparePrograms);
    const near = evaluated.filter((result) => !result.passed).sort(compareNear);
    const needsOfficialReview: UnsupportedProgramItem[] =
      needsOfficialReviewPrograms.map((program) => ({
        program,
        ...(requiresSpecialScreening(program) &&
        supportsAcademicPartialEvaluation(program, applicantGender)
          ? {
              academicEvaluation: evaluateAcademicCriteria(
                program,
                userScores,
                applicantGender,
              ),
            }
          : {}),
      }));
    const academicReviewEvaluations = needsOfficialReview.flatMap((item) =>
      item.academicEvaluation ? [item.academicEvaluation] : [],
    );
    const missingSubjects = SCORE_SUBJECTS.filter((subject) =>
      [...evaluated, ...academicReviewEvaluations].some((result) =>
        result.missingSubjects.includes(subject),
      ),
    );

    return {
      matched,
      supported,
      needsOfficialReview,
      passed,
      near,
      missingSubjects,
    };
  }, [programs, query]);

  const querySearch = queryStateToParams(query).toString();
  const academicReviewEvaluations = evaluation.needsOfficialReview.flatMap(
    (item) => item.academicEvaluation ? [item.academicEvaluation] : [],
  );
  const specialPassed = academicReviewEvaluations.filter(
    (result) => result.passed,
  );
  const specialNear = academicReviewEvaluations.filter(
    (result) => !result.passed,
  );
  const passedResults = [...evaluation.passed, ...specialPassed].sort(
    comparePrograms,
  );
  const nearResults = [...evaluation.near, ...specialNear].sort(compareNear);
  const unresolvedReviews = evaluation.needsOfficialReview.filter(
    (item) => !item.academicEvaluation,
  );
  const closest = nearResults[0];
  const hasDepartmentFilter =
    query.programSelections.自然組.mode !== "none" ||
    query.programSelections.社會組.mode !== "none";
  const passedStart = passedPage * RESULT_PAGE_SIZE;
  const nearStart = nearPage * RESULT_PAGE_SIZE;
  const reviewStart = reviewPage * RESULT_PAGE_SIZE;

  function changePage(
    page: number,
    setPage: (page: number) => void,
    blockId: string,
  ) {
    setPage(page);
    window.requestAnimationFrame(() => {
      document.getElementById(blockId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  return (
    <main className="subpage-main results-page">
      <SubpageHeader kicker="YOUR RESULTS" title="一階篩選回測結果" />

      <section className="results-section standalone-results" aria-live="polite">
        <div className="results-heading">
          <div>
            <span className="step-kicker">RESULTS</span>
            <h1>一階篩選回測結果</h1>
            <p>
              符合條件 {evaluation.matched.length} 筆；已完成學測門檻試算{" "}
              {evaluation.supported.length + academicReviewEvaluations.length}
              筆，其中學測可能通過 {passedResults.length} 筆
              {specialPassed.length > 0
                ? `（${specialPassed.length} 筆另須特殊檢定／證照）`
                : ""}
              。另有 {unresolvedReviews.length} 筆缺少可獨立試算的學測門檻。
            </p>
          </div>
          <RouteLink className="back-to-query" route="query" search={querySearch}>
            修改成績或條件
          </RouteLink>
        </div>

        {evaluation.missingSubjects.length > 0 ? (
          <div className="missing-alert" role="status">
            <span aria-hidden="true">!</span>
            <p>
              <b>有科目尚未輸入：</b>
              {evaluation.missingSubjects.join("、")}；相關規則暫以 0 級分計算。
            </p>
          </div>
        ) : null}

        {hasDepartmentFilter && passedResults.length === 0 && closest ? (
          <div className="closest-callout">
            <span>最接近目標</span>
            <p>
              你目前選取的科系尚未有任何一筆通過。
              最接近的是 <b>{closest.program.schoolName}</b>
              {closest.program.programName}，最少還需 +
              {closest.nearestBoost[0]?.totalPoints ?? "—"} 級分。
            </p>
          </div>
        ) : null}

        <div className="result-block" id="passed-results">
          <div className="result-block-heading passed-heading">
            <div>
              <span className="result-icon" aria-hidden="true">✓</span>
              <div>
                <h2>可能通過的一階校系</h2>
                <p>
                  一般校系所有倍率篩選關卡皆達到 114 學年度最低級分；黃色校系僅代表可確認的學測門檻已達標，仍須通過特殊檢定／證照，請點卡片內官方連結確認。
                </p>
              </div>
            </div>
            <strong>{passedResults.length}</strong>
          </div>
          <ProgramResultTable
            emptyMessage="目前條件下沒有全部過關的校系；請查看下方最接近的選項。"
            evaluations={passedResults.slice(
              passedStart,
              passedStart + RESULT_PAGE_SIZE,
            )}
            startIndex={passedStart}
            tone="passed"
          />
          <ResultPagination
            currentPage={passedPage}
            label="可能通過校系"
            onPageChange={(page) =>
              changePage(page, setPassedPage, "passed-results")
            }
            totalItems={passedResults.length}
          />
        </div>

        <div className="result-block near-block" id="near-results">
          <div className="result-block-heading near-heading">
            <div>
              <span className="result-icon" aria-hidden="true">↗</span>
              <div>
                <h2>未通過但接近的校系</h2>
                <p>依「最少總加分」由近到遠排列，每頁顯示 20 筆。</p>
              </div>
            </div>
            <strong>{nearResults.length}</strong>
          </div>
          <ProgramResultTable
            emptyMessage={
              evaluation.matched.length === 0
                ? "目前篩選條件沒有校系資料，請返回上一頁調整學校或科系。"
                : evaluation.supported.length +
                      academicReviewEvaluations.length ===
                    0
                  ? "符合條件的校系目前皆缺少可試算門檻，請查看下方說明。"
                : "太好了，符合條件的校系已全部通過。"
            }
            evaluations={nearResults.slice(
              nearStart,
              nearStart + RESULT_PAGE_SIZE,
            )}
            startIndex={nearStart}
            tone="near"
          />
          <ResultPagination
            currentPage={nearPage}
            label="接近校系"
            onPageChange={(page) =>
              changePage(page, setNearPage, "near-results")
            }
            totalItems={nearResults.length}
          />
        </div>

        {unresolvedReviews.length > 0 ? (
          <div className="result-block review-block" id="review-results">
            <div className="result-block-heading review-heading">
              <div>
                <span className="result-icon" aria-hidden="true">!</span>
                <div>
                  <h2>尚無法完成學測試算</h2>
                  <p>
                    官方資料未提供可和特殊成績分開計算的學測門檻，或尚未選擇必要組別；請依卡片說明補充條件。
                  </p>
                </div>
              </div>
              <strong>{unresolvedReviews.length}</strong>
            </div>
            <UnsupportedProgramTable
              emptyMessage="目前符合條件的校系都有可試算的學測門檻。"
              items={unresolvedReviews.slice(
                reviewStart,
                reviewStart + RESULT_PAGE_SIZE,
              )}
              startIndex={reviewStart}
            />
            <ResultPagination
              currentPage={reviewPage}
              label="無法完成試算校系"
              onPageChange={(page) =>
                changePage(page, setReviewPage, "review-results")
              }
              totalItems={unresolvedReviews.length}
            />
          </div>
        ) : null}

        {hasDepartmentFilter && evaluation.matched.length === 0 ? (
          <div className="filter-conflict-alert" role="alert">
            <span aria-hidden="true">!</span>
            <p>
              <b>目前的學校範圍與科系選擇沒有交集。</b>
              請返回修改條件，改選學校範圍或科系；這不是成績高低造成的結果。
            </p>
          </div>
        ) : null}
      </section>

      <div>
        <PageNavigation
          nextLabel="下一頁：返回首頁"
          nextRoute="home"
          previousLabel="前一頁：修改條件"
          previousRoute="query"
          previousSearch={querySearch}
        />
      </div>
    </main>
  );
}
