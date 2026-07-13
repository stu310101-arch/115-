"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { SCHOOL_GROUPS } from "@/config/schoolGroups";
import {
  evaluateProgram,
  supportsProgramEvaluation,
} from "@/lib/admission";
import { filterPrograms, type ProgramFilterCriteria } from "@/lib/filters";
import type { EvaluationResult, Program, UserScores } from "@/lib/types";
import { PageNavigation, RouteLink, SubpageHeader } from "./PageNavigation";
import { NavigationLoadingScreen } from "./NavigationLoadingProvider";
import {
  ProgramResultTable,
  UnsupportedProgramTable,
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
    const needsOfficialReview = matched
      .filter(
        (program) => !supportsProgramEvaluation(program, applicantGender),
      )
      .sort(compareProgramRecords);
    const evaluated = supported.map((program) =>
      evaluateProgram(program, userScores, applicantGender),
    );
    const passed = evaluated.filter((result) => result.passed).sort(comparePrograms);
    const near = evaluated.filter((result) => !result.passed).sort(compareNear);
    const missingSubjects = SCORE_SUBJECTS.filter((subject) =>
      evaluated.some((result) => result.missingSubjects.includes(subject)),
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
  const closest = evaluation.near[0];
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
              符合條件 {evaluation.matched.length} 筆；可安全自動判斷{" "}
              {evaluation.supported.length} 筆，其中可能通過{" "}
              {evaluation.passed.length} 筆。另有{" "}
              {evaluation.needsOfficialReview.length} 筆請查看官方資料。
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

        {hasDepartmentFilter && evaluation.passed.length === 0 && closest ? (
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
                <p>所有倍率篩選關卡皆達到 114 學年度最低級分。</p>
              </div>
            </div>
            <strong>{evaluation.passed.length}</strong>
          </div>
          <ProgramResultTable
            emptyMessage="目前條件下沒有全部過關的校系；請查看下方最接近的選項。"
            evaluations={evaluation.passed.slice(
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
            totalItems={evaluation.passed.length}
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
            <strong>{evaluation.near.length}</strong>
          </div>
          <ProgramResultTable
            emptyMessage={
              evaluation.matched.length === 0
                ? "目前篩選條件沒有校系資料，請返回上一頁調整學校或科系。"
                : evaluation.supported.length === 0
                  ? "符合條件的校系目前皆待確認，請查看下方官方資料清單。"
                : "太好了，符合條件的校系已全部通過。"
            }
            evaluations={evaluation.near.slice(
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
            totalItems={evaluation.near.length}
          />
        </div>

        <div className="result-block review-block" id="review-results">
          <div className="result-block-heading review-heading">
            <div>
              <span className="result-icon" aria-hidden="true">!</span>
              <div>
                <h2>資料待確認／查看官方</h2>
                <p>
                  這些校系可被搜尋，但門檻尚無法安全自動判斷；每頁顯示 20 筆。
                </p>
              </div>
            </div>
            <strong>{evaluation.needsOfficialReview.length}</strong>
          </div>
          <UnsupportedProgramTable
            emptyMessage="目前符合條件的校系都已有完整門檻，可以自動回測。"
            programs={evaluation.needsOfficialReview.slice(
              reviewStart,
              reviewStart + RESULT_PAGE_SIZE,
            )}
            startIndex={reviewStart}
          />
          <ResultPagination
            currentPage={reviewPage}
            label="待確認校系"
            onPageChange={(page) =>
              changePage(page, setReviewPage, "review-results")
            }
            totalItems={evaluation.needsOfficialReview.length}
          />
        </div>
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
