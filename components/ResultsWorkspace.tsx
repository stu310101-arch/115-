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
import type {
  ApcsScores,
  EvaluationResult,
  Program,
  UserScores,
} from "@/lib/types";
import { PageNavigation, RouteLink, SubpageHeader } from "./PageNavigation";
import { NavigationLoadingScreen } from "./NavigationLoadingProvider";
import {
  ProgramResultTable,
  UnsupportedProgramTable,
  type UnsupportedProgramItem,
} from "./ProgramResultTable";
import { SCORE_SUBJECTS } from "./ScoreForm";
import { YearSwitcher } from "./YearSwitcher";
import {
  queryStateToParams,
  restoreQueryState,
  saveQueryState,
  type AdmissionQueryState,
} from "./queryState";

type ResultsWorkspaceProps = {
  programs: Program[];
};

const RESULT_DESKTOP_PAGE_SIZE = 20;
const RESULT_MOBILE_PAGE_SIZE = 10;
const RESULT_MOBILE_MEDIA_QUERY = "(max-width: 720px)";
type ResultTab = "passed" | "near" | "review";
type PassedResultScope = "all" | "confirmed" | "pending";
type ResultSort = "default" | "school" | "department";

type ResultPaginationProps = {
  currentPage: number;
  label: string;
  onPageChange: (page: number) => void;
  pageSize: number;
  totalItems: number;
};

function ResultPagination({
  currentPage,
  label,
  onPageChange,
  pageSize,
  totalItems,
}: ResultPaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return null;

  const start = currentPage * pageSize + 1;
  const end = Math.min(totalItems, start + pageSize - 1);

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

function toApcsScores(query: AdmissionQueryState): ApcsScores {
  const scores: ApcsScores = {};
  if (query.apcsScores.concept.trim() !== "") {
    scores.concept = Number(query.apcsScores.concept);
  }
  if (query.apcsScores.practice.trim() !== "") {
    scores.practice = Number(query.apcsScores.practice);
  }
  return scores;
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
  const leftBoost = left.academicPassed
    ? (left.apcsEvaluation?.failedRules.reduce(
        (total, result) => total + result.deficit,
        0,
      ) ?? Number.POSITIVE_INFINITY)
    : (left.nearestBoost[0]?.totalPoints ?? Number.POSITIVE_INFINITY);
  const rightBoost = right.academicPassed
    ? (right.apcsEvaluation?.failedRules.reduce(
        (total, result) => total + result.deficit,
        0,
      ) ?? Number.POSITIVE_INFINITY)
    : (right.nearestBoost[0]?.totalPoints ?? Number.POSITIVE_INFINITY);
  return leftBoost - rightBoost || comparePrograms(left, right);
}

function compareProgramRecords(left: Program, right: Program): number {
  return (
    schoolPriority(left.schoolId) - schoolPriority(right.schoolId) ||
    left.schoolId.localeCompare(right.schoolId) ||
    left.programCode.localeCompare(right.programCode)
  );
}

function compareDepartments(
  left: EvaluationResult,
  right: EvaluationResult,
): number {
  return (
    left.program.programName.localeCompare(
      right.program.programName,
      "zh-Hant",
    ) || comparePrograms(left, right)
  );
}

function requiresSpecialScreening(program: Program): boolean {
  return (
    program.reviewReasons?.some((reason) =>
      reason.startsWith("需特殊檢定"),
    ) ?? false
  );
}

function hasPendingSpecialCondition(result: EvaluationResult): boolean {
  if (result.program.evaluationSupport !== "supported") return true;
  const specialReasons = (result.program.reviewReasons ?? []).filter((reason) =>
    reason.startsWith("需特殊檢定"),
  );
  if (specialReasons.some((reason) => !reason.includes("APCS"))) return true;
  if (result.apcsEvaluation) return !result.apcsEvaluation.complete;
  return specialReasons.length > 0;
}

function matchesResultSearch(program: Program, rawSearch: string): boolean {
  const search = rawSearch
    .normalize("NFKC")
    .toLocaleLowerCase("zh-Hant")
    .replace(/[\s\u3000·・‧,，、()（）\-_/]+/gu, "");
  if (!search) return true;
  return [program.schoolName, program.programName, program.programCode].some(
    (value) =>
      value
        .normalize("NFKC")
        .toLocaleLowerCase("zh-Hant")
        .replace(/[\s\u3000·・‧,，、()（）\-_/]+/gu, "")
        .includes(search),
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
  const [activeTab, setActiveTab] = useState<ResultTab>("passed");
  const [resultPage, setResultPage] = useState(0);
  const [resultSearch, setResultSearch] = useState("");
  const [passedScope, setPassedScope] =
    useState<PassedResultScope>("all");
  const [resultSort, setResultSort] = useState<ResultSort>("default");
  const [resultPageSize, setResultPageSize] = useState(
    RESULT_DESKTOP_PAGE_SIZE,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(RESULT_MOBILE_MEDIA_QUERY);
    const updatePageSize = () => {
      setResultPageSize(
        mediaQuery.matches
          ? RESULT_MOBILE_PAGE_SIZE
          : RESULT_DESKTOP_PAGE_SIZE,
      );
      setResultPage(0);
    };

    updatePageSize();
    mediaQuery.addEventListener("change", updatePageSize);
    return () => mediaQuery.removeEventListener("change", updatePageSize);
  }, []);

  useEffect(() => {
    saveQueryState(query);
  }, [query]);

  const evaluation = useMemo(() => {
    const hasProgramSelection =
      query.programSelections.自然組.mode !== "none" ||
      query.programSelections.社會組.mode !== "none";
    const criteria: ProgramFilterCriteria = {
      schoolGroupIds: query.schoolGroupIds,
      customSchoolIds: query.customSchoolIds,
      groupedProgramSelections: hasProgramSelection
        ? query.programSelections
        : undefined,
      groupTags:
        query.filterMethod === "academic-categories"
          ? query.groupSelection
          : [],
      academicCategoryIds:
        query.filterMethod === "academic-categories"
          ? query.academicCategoryIds
          : [],
      learningGroupIds:
        query.filterMethod === "learning-groups"
          ? query.learningGroupIds
          : [],
    };
    const matched = filterPrograms(programs, criteria);
    const userScores = toUserScores(query);
    const apcsScores = toApcsScores(query);
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
      evaluateProgram(program, userScores, applicantGender, apcsScores),
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
                apcsScores,
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
  const confirmedPassedResults = passedResults.filter(
    (result) => !hasPendingSpecialCondition(result),
  );
  const pendingPassedResults = passedResults.filter(hasPendingSpecialCondition);
  const unresolvedReviews = evaluation.needsOfficialReview.filter(
    (item) => !item.academicEvaluation,
  );
  const closest = nearResults[0];
  const hasDepartmentFilter =
    query.programSelections.自然組.mode !== "none" ||
    query.programSelections.社會組.mode !== "none";
  const searchedPassedResults = (
    passedScope === "confirmed"
      ? confirmedPassedResults
      : passedScope === "pending"
        ? pendingPassedResults
        : passedResults
  ).filter((result) => matchesResultSearch(result.program, resultSearch));
  const searchedNearResults = nearResults.filter((result) =>
    matchesResultSearch(result.program, resultSearch),
  );
  const searchedUnresolvedReviews = unresolvedReviews.filter((item) =>
    matchesResultSearch(item.program, resultSearch),
  );
  const sortEvaluations = (items: readonly EvaluationResult[]) =>
    [...items].sort(
      resultSort === "department"
        ? compareDepartments
        : resultSort === "school"
          ? comparePrograms
          : activeTab === "near"
            ? compareNear
            : comparePrograms,
    );
  const visiblePassedResults = sortEvaluations(searchedPassedResults);
  const visibleNearResults = sortEvaluations(searchedNearResults);
  const visibleUnresolvedReviews = [...searchedUnresolvedReviews].sort(
    (left, right) =>
      resultSort === "department"
        ? left.program.programName.localeCompare(
            right.program.programName,
            "zh-Hant",
          ) || compareProgramRecords(left.program, right.program)
        : compareProgramRecords(left.program, right.program),
  );
  const resultStart = resultPage * resultPageSize;

  function changePage(page: number, blockId: string) {
    setResultPage(page);
    window.requestAnimationFrame(() => {
      document.getElementById(blockId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  return (
    <main className="subpage-main results-page">
      <YearSwitcher
        currentYear="115"
        searchParams={querySearch}
        variant="results"
      />
      <SubpageHeader kicker="YOUR RESULTS" title="一階篩選回測結果" />

      <section className="results-section standalone-results" aria-live="polite">
        <div className="results-heading">
          <div>
            <span className="step-kicker">RESULTS</span>
            <h1>一階篩選回測結果</h1>
            <p>
              符合條件 {evaluation.matched.length} 筆；已完成學測門檻試算{" "}
              {evaluation.supported.length + academicReviewEvaluations.length}{" "}
              筆。學測門檻達標 {passedResults.length} 筆，其中可列為可能通過{" "}
              {confirmedPassedResults.length} 筆、尚待補填 APCS 或確認特殊檢定{" "}
              {pendingPassedResults.length} 筆。另有 {unresolvedReviews.length} 筆缺少可獨立試算的學測門檻。
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
              {closest.program.programName}
              {closest.academicPassed &&
              closest.apcsEvaluation?.failedRules.length ? (
                <>
                  ，學測已達標，但 APCS
                  {closest.apcsEvaluation.failedRules
                    .map((result) => result.label.replace(/^APCS\s*/u, ""))
                    .join("、")}
                  未通過。
                </>
              ) : (
                <>
                  ，學測最少還需 +
                  {closest.nearestBoost[0]?.totalPoints ?? "—"} 級分。
                </>
              )}
            </p>
          </div>
        ) : null}

        <div className="result-explorer">
          <div
            aria-label="結果狀態"
            className="result-tabs"
            role="tablist"
          >
            <button
              aria-controls="result-tab-panel"
              aria-selected={activeTab === "passed"}
              className={activeTab === "passed" ? "selected" : ""}
              onClick={() => {
                setActiveTab("passed");
                setResultPage(0);
              }}
              role="tab"
              type="button"
            >
              <span>學測達標</span> <b>{passedResults.length}</b>
            </button>
            <button
              aria-controls="result-tab-panel"
              aria-selected={activeTab === "near"}
              className={activeTab === "near" ? "selected" : ""}
              onClick={() => {
                setActiveTab("near");
                setResultPage(0);
              }}
              role="tab"
              type="button"
            >
              <span>未通過／接近</span> <b>{nearResults.length}</b>
            </button>
            <button
              aria-controls="result-tab-panel"
              aria-selected={activeTab === "review"}
              className={activeTab === "review" ? "selected" : ""}
              onClick={() => {
                setActiveTab("review");
                setResultPage(0);
              }}
              role="tab"
              type="button"
            >
              <span>無法試算</span> <b>{unresolvedReviews.length}</b>
            </button>
          </div>

          <div className="result-tools">
            <label className="result-search-field">
              <span>搜尋目前結果</span>
              <input
                onChange={(event) => {
                  setResultSearch(event.target.value);
                  setResultPage(0);
                }}
                placeholder="校名、科系或校系代碼"
                type="search"
                value={resultSearch}
              />
            </label>
            <label className="result-sort-field">
              <span>排序</span>
              <select
                onChange={(event) => {
                  setResultSort(event.target.value as ResultSort);
                  setResultPage(0);
                }}
                value={resultSort}
              >
                <option value="default">
                  {activeTab === "near" ? "差距由近到遠" : "預設校序"}
                </option>
                <option value="school">依學校排序</option>
                <option value="department">依科系名稱排序</option>
              </select>
            </label>
          </div>

          {activeTab === "passed" ? (
            <div className="passed-scope-filter" role="group" aria-label="學測達標結果篩選">
              <button
                aria-pressed={passedScope === "all"}
                onClick={() => {
                  setPassedScope("all");
                  setResultPage(0);
                }}
                type="button"
              >
                全部 {passedResults.length}
              </button>
              <button
                aria-pressed={passedScope === "confirmed"}
                onClick={() => {
                  setPassedScope("confirmed");
                  setResultPage(0);
                }}
                type="button"
              >
                可能通過 {confirmedPassedResults.length}
              </button>
              <button
                aria-pressed={passedScope === "pending"}
                onClick={() => {
                  setPassedScope("pending");
                  setResultPage(0);
                }}
                type="button"
              >
                待確認 {pendingPassedResults.length}
              </button>
            </div>
          ) : null}
        </div>

        {activeTab === "passed" ? (
          <div
            className="result-block active-result-block"
            id="result-tab-panel"
            role="tabpanel"
          >
            <div className="result-block-heading passed-heading">
              <div>
                <span className="result-icon" aria-hidden="true">✓</span>
                <div>
                  <h2>學測門檻達標的一階校系</h2>
                  <p>
                    可能通過與待確認已分開計數；黃色校系仍須補 APCS 或確認其他特殊檢定。APCS 留白只提醒，不會當成 0 分淘汰。
                  </p>
                </div>
              </div>
              <strong>{visiblePassedResults.length}</strong>
            </div>
            <ProgramResultTable
              emptyMessage="目前的狀態篩選或搜尋條件沒有符合校系。"
              evaluations={visiblePassedResults.slice(
                resultStart,
                resultStart + resultPageSize,
              )}
              startIndex={resultStart}
              tone="passed"
            />
            <ResultPagination
              currentPage={resultPage}
              label="學測達標校系"
              onPageChange={(page) => changePage(page, "result-tab-panel")}
              pageSize={resultPageSize}
              totalItems={visiblePassedResults.length}
            />
          </div>
        ) : null}

        {activeTab === "near" ? (
          <div
            className="result-block active-result-block near-block"
            id="result-tab-panel"
            role="tabpanel"
          >
            <div className="result-block-heading near-heading">
              <div>
                <span className="result-icon" aria-hidden="true">↗</span>
                <div>
                  <h2>未通過但接近的校系</h2>
                  <p>
                    依「最少總加分」由近到遠排列，每頁顯示 {resultPageSize} 筆。
                  </p>
                </div>
              </div>
              <strong>{visibleNearResults.length}</strong>
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
              evaluations={visibleNearResults.slice(
                resultStart,
                resultStart + resultPageSize,
              )}
              startIndex={resultStart}
              tone="near"
            />
            <ResultPagination
              currentPage={resultPage}
              label="接近校系"
              onPageChange={(page) => changePage(page, "result-tab-panel")}
              pageSize={resultPageSize}
              totalItems={visibleNearResults.length}
            />
          </div>
        ) : null}

        {activeTab === "review" ? (
          <div
            className="result-block active-result-block review-block"
            id="result-tab-panel"
            role="tabpanel"
          >
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
              <strong>{visibleUnresolvedReviews.length}</strong>
            </div>
            <UnsupportedProgramTable
              emptyMessage="目前符合條件的校系都有可試算的學測門檻。"
              items={visibleUnresolvedReviews.slice(
                resultStart,
                resultStart + resultPageSize,
              )}
              startIndex={resultStart}
            />
            <ResultPagination
              currentPage={resultPage}
              label="無法完成試算校系"
              onPageChange={(page) => changePage(page, "result-tab-panel")}
              pageSize={resultPageSize}
              totalItems={visibleUnresolvedReviews.length}
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
