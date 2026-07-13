"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import { matchesSchoolSelection } from "@/lib/filters";
import {
  selectedUniqueProgramCodes,
  type ProgramOption,
} from "@/lib/programSelection";
import { FilterPanel, type SchoolSourceOption } from "./FilterPanel";
import {
  NavigationLoadingScreen,
  useNavigationLoading,
} from "./NavigationLoadingProvider";
import { ScoreForm, type ScoreSubject } from "./ScoreForm";
import { PageNavigation, SubpageHeader } from "./PageNavigation";
import {
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

  const selectedProgramCodes = useMemo(
    () => selectedUniqueProgramCodes(programOptions, query.programSelections),
    [programOptions, query.programSelections],
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

  function update<K extends keyof AdmissionQueryState>(
    key: K,
    value: AdmissionQueryState[K],
  ) {
    setQuery((current) => ({ ...current, [key]: value }));
  }

  function selectGroup(value: Exclude<GroupSelection, "all">) {
    setQuery((current) => ({ ...current, groupSelection: value }));
  }

  function showResults(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requiresProgramSelection) return;
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
          <span>STEP 01—02</span>
          <h1>先從你的成績開始</h1>
          <p>填入成績並選擇學校、科系；未填的科目會以 0 級分計算。</p>
        </div>

        <div className="query-grid">
          <ScoreForm
            applicantGender={query.applicantGender}
            onApplicantGenderChange={(value) =>
              update("applicantGender", value)
            }
            onChange={updateScore}
            onClear={() => update("scores", { ...EMPTY_SCORES })}
            onUseExample={() => update("scores", { ...EXAMPLE_SCORES })}
            scores={query.scores}
          />
          <FilterPanel
            customSchoolIds={query.customSchoolIds}
            groupSelection={query.groupSelection}
            onCustomSchoolIdsChange={(value) =>
              update("customSchoolIds", value)
            }
            onGroupSelectionChange={selectGroup}
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
            programSelections={query.programSelections}
            schoolGroupIds={query.schoolGroupIds}
            schoolSources={schoolSources}
          />
        </div>

        <div className="submit-bar">
          <div>
            <span className="submit-index">03</span>
            <p>
              將依目前條件逐關比對 <b>{comparisonCount}</b> 筆校系資料
            </p>
            {requiresProgramSelection ? (
              <small className="submit-guidance" role="status">
                請至少勾選一個科系，或按右上角「全選」。
              </small>
            ) : null}
          </div>
          <button
            className="submit-button"
            data-testid="submit-query"
            disabled={requiresProgramSelection}
            type="submit"
          >
            查看 <span aria-hidden="true">→</span>
          </button>
        </div>
      </form>
      <PageNavigation
        nextDisabled={requiresProgramSelection}
        nextLabel="下一頁：查看結果"
        nextRoute="results"
        nextSearch={querySearch}
        previousLabel="前一頁：網站介紹"
        previousRoute="how-it-works"
      />
    </main>
  );
}
