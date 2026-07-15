"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import { matchesSchoolSelection } from "@/lib/filters";
import {
  EMPTY_PROGRAM_SELECTION,
  selectedUniqueProgramCodes,
  type ProgramOption,
} from "@/lib/programSelection";
import type { GroupTag } from "@/lib/types";
import { matchesLearningGroupIds } from "@/lib/learningGroups";
import { FilterPanel, type SchoolSourceOption } from "./FilterPanel";
import {
  NavigationLoadingScreen,
  useNavigationLoading,
} from "./NavigationLoadingProvider";
import {
  ScoreForm,
  type ApcsScorePart,
  type ScoreSubject,
} from "./ScoreForm";
import { PageNavigation, SubpageHeader } from "./PageNavigation";
import {
  EMPTY_APCS_SCORES,
  EMPTY_SCORES,
  EXAMPLE_SCORES,
  queryStateToParams,
  restoreQueryState,
  routePath,
  saveQueryState,
  type AdmissionQueryState,
  type GroupSelection,
} from "./queryState";

type QueryWorkspaceProps = {
  programCount: number;
  programOptions: readonly ProgramOption[];
  schoolSources: readonly SchoolSourceOption[];
};

const subscribeToHydration = () => () => {};

export function QueryWorkspace(props: QueryWorkspaceProps) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );

  if (!hydrated) return <NavigationLoadingScreen />;

  return <HydratedQueryWorkspace {...props} />;
}

function HydratedQueryWorkspace({
  programOptions,
  schoolSources,
}: QueryWorkspaceProps) {
  const [query, setQuery] = useState<AdmissionQueryState>(() =>
    restoreQueryState(),
  );
  const { navigate } = useNavigationLoading();

  const learningGroupFilteredProgramOptions = useMemo(
    () =>
      programOptions.filter((program) =>
        matchesLearningGroupIds(
          program.learningGroupIds,
          query.learningGroupIds,
        ),
      ),
    [programOptions, query.learningGroupIds],
  );
  const selectedProgramCodes = useMemo(
    () =>
      selectedUniqueProgramCodes(
        learningGroupFilteredProgramOptions,
        query.programSelections,
      ),
    [learningGroupFilteredProgramOptions, query.programSelections],
  );
  const selectedCount = selectedProgramCodes.length;
  const requiresProgramSelection = selectedCount === 0;
  const comparisonCount = useMemo(() => {
    const selectedCodes = new Set(selectedProgramCodes);
    return programOptions.filter(
      (program) =>
        selectedCodes.has(program.programCode) &&
        matchesSchoolSelection(
          program,
          query.schoolGroupIds,
          query.customSchoolIds,
        ),
    ).length;
  }, [
    programOptions,
    query.customSchoolIds,
    query.schoolGroupIds,
    selectedProgramCodes,
  ]);
  const hasEmptyFilterIntersection =
    !requiresProgramSelection && comparisonCount === 0;
  const cannotShowResults =
    requiresProgramSelection || hasEmptyFilterIntersection;

  function updateScore(subject: ScoreSubject, value: string) {
    if (value === "") {
      setQuery((current) => ({
        ...current,
        scores: { ...current.scores, [subject]: "" },
      }));
      return;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return;
    const maximum = subject === "英聽" ? 3 : 15;
    const bounded = Math.max(0, Math.min(maximum, Math.trunc(numericValue)));
    setQuery((current) => ({
      ...current,
      scores: { ...current.scores, [subject]: String(bounded) },
    }));
  }

  function updateApcsScore(part: ApcsScorePart, value: string) {
    if (value === "") {
      setQuery((current) => ({
        ...current,
        apcsScores: { ...current.apcsScores, [part]: "" },
      }));
      return;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return;
    const bounded = Math.max(0, Math.min(5, Math.trunc(numericValue)));
    setQuery((current) => ({
      ...current,
      apcsScores: { ...current.apcsScores, [part]: String(bounded) },
    }));
  }

  function update<K extends keyof AdmissionQueryState>(
    key: K,
    value: AdmissionQueryState[K],
  ) {
    setQuery((current) => ({ ...current, [key]: value }));
  }

  function selectGroups(value: GroupSelection) {
    setQuery((current) => {
      const removedGroups = current.groupSelection.filter(
        (group) => !value.includes(group),
      );
      const programSelections = { ...current.programSelections };
      removedGroups.forEach((group: GroupTag) => {
        programSelections[group] = EMPTY_PROGRAM_SELECTION;
      });
      return {
        ...current,
        groupSelection: value,
        programSelections,
      };
    });
  }

  function showResults(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cannotShowResults) return;
    saveQueryState(query);
    const params = queryStateToParams(query).toString();
    const destination = routePath("results");
    navigate(params ? `${destination}?${params}` : destination);
  }

  const querySearch = queryStateToParams(query).toString();

  return (
    <main className="subpage-main query-page">
      <SubpageHeader kicker="YOUR PROFILE" title="輸入成績與篩選校系" />

      <form className="query-section standalone-query" onSubmit={showResults}>
        <div className="query-intro">
          <h1>先從你的成績開始</h1>
          <p>
            學測未填科目以 0 級分計算；APCS 為選填，留白只提醒、不判定為 0 分。
          </p>
        </div>

        <div className="query-grid">
          <ScoreForm
            apcsScores={query.apcsScores}
            applicantGender={query.applicantGender}
            onApplicantGenderChange={(value) =>
              update("applicantGender", value)
            }
            onChange={updateScore}
            onApcsChange={updateApcsScore}
            onClear={() =>
              setQuery((current) => ({
                ...current,
                scores: { ...EMPTY_SCORES },
                apcsScores: { ...EMPTY_APCS_SCORES },
              }))
            }
            onUseExample={() =>
              setQuery((current) => ({
                ...current,
                scores: { ...EXAMPLE_SCORES },
                apcsScores: { ...EMPTY_APCS_SCORES },
              }))
            }
            scores={query.scores}
          />
          <FilterPanel
            customSchoolIds={query.customSchoolIds}
            groupSelection={query.groupSelection}
            onCustomSchoolIdsChange={(value) =>
              update("customSchoolIds", value)
            }
            onGroupSelectionChange={selectGroups}
            onProgramSelectionChange={(group, value) =>
              setQuery((current) => ({
                ...current,
                programSelections: {
                  ...current.programSelections,
                  [group]: value,
                },
              }))
            }
            onSchoolGroupIdsChange={(value) =>
              update("schoolGroupIds", value)
            }
            programOptions={programOptions}
            learningGroupIds={query.learningGroupIds}
            onLearningGroupIdsChange={(value) =>
              update("learningGroupIds", value)
            }
            programSelections={query.programSelections}
            schoolGroupIds={query.schoolGroupIds}
            schoolSources={schoolSources}
          />
        </div>

        <div className="submit-bar">
          <div>
            <p>
              將依目前條件逐關比對 <b>{comparisonCount}</b> 筆校系資料
            </p>
            {requiresProgramSelection ? (
              <small className="submit-guidance" role="status">
                請至少勾選一個科系，或使用「全選本頁／全選搜尋結果／全選所有科系」。
              </small>
            ) : hasEmptyFilterIntersection ? (
              <small className="submit-guidance" role="alert">
                目前的學校範圍與科系選擇沒有交集；請改選學校範圍或科系後再查看。
              </small>
            ) : null}
          </div>
          <button
            className="submit-button"
            data-testid="submit-query"
            disabled={cannotShowResults}
            type="submit"
          >
            查看 <span aria-hidden="true">→</span>
          </button>
        </div>
      </form>
      <PageNavigation
        nextDisabled={cannotShowResults}
        nextLabel="下一頁：查看結果"
        nextRoute="results"
        nextSearch={querySearch}
        previousLabel="前一頁：網站介紹"
        previousRoute="how-it-works"
      />
    </main>
  );
}
