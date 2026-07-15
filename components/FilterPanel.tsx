"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SCHOOL_GROUP_OPTIONS,
  type SchoolGroupId,
} from "@/config/schoolGroups";
import {
  areProgramCodesSelected,
  EMPTY_PROGRAM_SELECTION,
  rankDepartmentOptions,
  selectedProgramCount,
  toDepartmentOptions,
  toggleProgramCodes,
  type DepartmentOption,
  type ProgramOption,
  type GroupedProgramSelections,
  type ProgramSelection,
} from "@/lib/programSelection";
import type { GroupTag } from "@/lib/types";
import {
  LEARNING_GROUP_OPTIONS,
  type LearningGroupId,
} from "@/lib/learningGroups";
import {
  ACADEMIC_CATEGORY_OPTIONS,
  academicCategoryOptionsForGroups,
  activeAdmissionGroupsForSelection,
  matchesProgramTaxonomySelection,
  type AcademicCategoryId,
  type ProgramFilterMethod,
} from "@/lib/admissionTaxonomy";
import type { GroupSelection } from "./queryState";
import { RouteLink } from "./PageNavigation";

export type SchoolSourceOption = {
  schoolId: string;
  schoolName: string;
};

type FilterPanelProps = {
  filterMethod: ProgramFilterMethod;
  onFilterMethodChange: (value: ProgramFilterMethod) => void;
  groupSelection: GroupSelection;
  onGroupSelectionChange: (value: GroupSelection) => void;
  academicCategoryIds: readonly AcademicCategoryId[];
  onAcademicCategoryIdsChange: (value: AcademicCategoryId[]) => void;
  schoolGroupIds: readonly SchoolGroupId[];
  onSchoolGroupIdsChange: (value: SchoolGroupId[]) => void;
  customSchoolIds: readonly string[];
  onCustomSchoolIdsChange: (value: string[]) => void;
  programSelections: GroupedProgramSelections;
  onProgramSelectionChange: (
    group: GroupTag,
    value: ProgramSelection,
  ) => void;
  programOptions: readonly ProgramOption[];
  learningGroupIds: readonly LearningGroupId[];
  onLearningGroupIdsChange: (value: LearningGroupId[]) => void;
  schoolSources: readonly SchoolSourceOption[];
};

type GroupedDepartmentOption = DepartmentOption & {
  programCodesByGroup: Partial<Record<GroupTag, readonly string[]>>;
};

const PROGRAM_PAGE_SIZE = 12;
const MOBILE_PROGRAM_PAGE_SIZE = 20;
const MOBILE_PROGRAM_MEDIA_QUERY = "(max-width: 720px)";
const BULK_SELECTION_CONFIRM_THRESHOLD = 100;
const SCHOOL_SEARCH_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "152": ["馬偕醫學大學"],
};

function toggleValue<T extends string>(values: readonly T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-Hant")
    .replace(/[\s\u3000·・‧,，、()（）\-_/]+/gu, "");
}

function useProgramPageSize(): number {
  const [pageSize, setPageSize] = useState(PROGRAM_PAGE_SIZE);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_PROGRAM_MEDIA_QUERY);
    const updatePageSize = () => {
      setPageSize(
        mediaQuery.matches ? MOBILE_PROGRAM_PAGE_SIZE : PROGRAM_PAGE_SIZE,
      );
    };

    updatePageSize();
    mediaQuery.addEventListener("change", updatePageSize);
    return () => mediaQuery.removeEventListener("change", updatePageSize);
  }, []);

  return pageSize;
}

export function FilterPanel({
  filterMethod,
  onFilterMethodChange,
  groupSelection,
  onGroupSelectionChange,
  academicCategoryIds,
  onAcademicCategoryIdsChange,
  schoolGroupIds,
  onSchoolGroupIdsChange,
  customSchoolIds,
  onCustomSchoolIdsChange,
  programSelections,
  onProgramSelectionChange,
  programOptions,
  learningGroupIds,
  onLearningGroupIdsChange,
  schoolSources,
}: FilterPanelProps) {
  const [schoolSearch, setSchoolSearch] = useState("");
  const [showCustomSchools, setShowCustomSchools] = useState(
    customSchoolIds.length > 0,
  );
  const [programSearch, setProgramSearch] = useState("");
  const [programPage, setProgramPage] = useState(0);
  const [pendingBulkSelection, setPendingBulkSelection] = useState<{
    departments: readonly GroupedDepartmentOption[];
    label: string;
  } | null>(null);
  const programPageSize = useProgramPageSize();

  const availableAcademicCategoryOptions = useMemo(
    () => academicCategoryOptionsForGroups(groupSelection),
    [groupSelection],
  );
  const taxonomySelection = useMemo(
    () =>
      ({
        filterMethod,
        groupSelection,
        academicCategoryIds,
        learningGroupIds,
      }) as const,
    [
      academicCategoryIds,
      filterMethod,
      groupSelection,
      learningGroupIds,
    ],
  );
  const activeProgramGroups = useMemo(
    () => activeAdmissionGroupsForSelection(taxonomySelection),
    [taxonomySelection],
  );
  const taxonomyFilteredPrograms = useMemo(
    () =>
      programOptions.filter((program) =>
        matchesProgramTaxonomySelection(program, taxonomySelection),
      ),
    [programOptions, taxonomySelection],
  );

  const filteredSchools = useMemo(() => {
    const query = normalizeSearch(schoolSearch);
    if (!query) return schoolSources;
    return schoolSources.filter(
      (school) =>
        school.schoolId.includes(query) ||
        normalizeSearch(school.schoolName).includes(query) ||
        (SCHOOL_SEARCH_ALIASES[school.schoolId] ?? []).some((alias) =>
          normalizeSearch(alias).includes(query),
        ),
    );
  }, [schoolSearch, schoolSources]);

  const programsByGroup = useMemo(
    () => ({
      自然組: taxonomyFilteredPrograms.filter((program) =>
        program.groupTags.includes("自然組"),
      ),
      社會組: taxonomyFilteredPrograms.filter((program) =>
        program.groupTags.includes("社會組"),
      ),
    }),
    [taxonomyFilteredPrograms],
  );
  const departmentsByGroup = useMemo(
    () => ({
      自然組: toDepartmentOptions(taxonomyFilteredPrograms, "自然組"),
      社會組: toDepartmentOptions(taxonomyFilteredPrograms, "社會組"),
    }),
    [taxonomyFilteredPrograms],
  );
  const groupDepartments = useMemo<GroupedDepartmentOption[]>(
    () => {
      const departments = new Map<string, GroupedDepartmentOption>();
      activeProgramGroups.forEach((group) => {
        departmentsByGroup[group].forEach((department) => {
          const current = departments.get(department.departmentName);
          const programCodesByGroup = {
            ...current?.programCodesByGroup,
            [group]: department.programCodes,
          };
          departments.set(department.departmentName, {
            departmentName: department.departmentName,
            programCodes: [
              ...new Set(Object.values(programCodesByGroup).flat()),
            ],
            programCodesByGroup,
          });
        });
      });
      return [...departments.values()].sort((left, right) =>
        left.departmentName.localeCompare(right.departmentName, "zh-Hant"),
      );
    },
    [activeProgramGroups, departmentsByGroup],
  );

  const filteredDepartments = useMemo(() => {
    return rankDepartmentOptions(
      groupDepartments,
      programSearch,
    ) as GroupedDepartmentOption[];
  }, [groupDepartments, programSearch]);

  const availableProgramCodesByGroup = useMemo(
    () => ({
      自然組: programsByGroup.自然組.map((program) => program.programCode),
      社會組: programsByGroup.社會組.map((program) => program.programCode),
    }),
    [programsByGroup],
  );
  const selectedCount = groupDepartments.filter((department) =>
    isDepartmentSelected(department),
  ).length;
  const allSchoolsSelected =
    schoolGroupIds.length === 0 && customSchoolIds.length === 0;
  const totalProgramPages = Math.max(
    1,
    Math.ceil(filteredDepartments.length / programPageSize),
  );
  const visibleProgramPage = Math.min(programPage, totalProgramPages - 1);
  const visibleDepartments = filteredDepartments.slice(
    visibleProgramPage * programPageSize,
    (visibleProgramPage + 1) * programPageSize,
  );
  const allVisibleDepartmentsSelected =
    visibleDepartments.length > 0 &&
    visibleDepartments.every((department) => isDepartmentSelected(department));
  const allSearchResultsSelected =
    filteredDepartments.length > 0 &&
    filteredDepartments.every((department) =>
      isDepartmentSelected(department),
    );
  const allDepartmentsSelected =
    groupDepartments.length > 0 &&
    groupDepartments.every((department) => isDepartmentSelected(department));

  function isDepartmentSelected(department: GroupedDepartmentOption): boolean {
    return activeProgramGroups.some((group) => {
      const programCodes = department.programCodesByGroup[group];
      return (
        Boolean(programCodes?.length) &&
        areProgramCodesSelected(programSelections[group], programCodes ?? [])
      );
    });
  }

  function normalizeProgramSelection(
    group: GroupTag,
    selection: ProgramSelection,
  ): ProgramSelection {
    const availableProgramCodes = availableProgramCodesByGroup[group];
    const nextCount = selectedProgramCount(selection, availableProgramCodes);
    if (nextCount === 0) return EMPTY_PROGRAM_SELECTION;
    if (nextCount === availableProgramCodes.length) {
      return { mode: "all", codes: [] };
    }
    return selection;
  }

  function toggleProgramDepartmentScope(
    departments: readonly GroupedDepartmentOption[],
  ) {
    const shouldSelect = !departments.every((department) =>
      isDepartmentSelected(department),
    );
    activeProgramGroups.forEach((group) => {
      let next = programSelections[group];
      departments.forEach((department) => {
        const programCodes = department.programCodesByGroup[group];
        if (!programCodes?.length) return;
        const isSelected = areProgramCodesSelected(next, programCodes);
        if (isSelected !== shouldSelect) {
          next = toggleProgramCodes(next, programCodes);
        }
      });
      onProgramSelectionChange(
        group,
        normalizeProgramSelection(group, next),
      );
    });
  }

  function requestProgramDepartmentScope(
    departments: readonly GroupedDepartmentOption[],
    label: string,
  ) {
    const shouldSelect = !departments.every((department) =>
      isDepartmentSelected(department),
    );
    if (
      shouldSelect &&
      departments.length >= BULK_SELECTION_CONFIRM_THRESHOLD
    ) {
      setPendingBulkSelection({ departments, label });
      return;
    }
    toggleProgramDepartmentScope(departments);
    setPendingBulkSelection(null);
  }

  const programStart = visibleProgramPage * programPageSize + 1;
  const programEnd = Math.min(
    filteredDepartments.length,
    programStart + programPageSize - 1,
  );
  const filterReady =
    (filterMethod === "academic-categories" && groupSelection.length > 0) ||
    (filterMethod === "learning-groups" && learningGroupIds.length > 0);
  const selectedCategoryLabels = ACADEMIC_CATEGORY_OPTIONS.filter((option) =>
    academicCategoryIds.includes(option.id),
  ).map(({ label }) => label);
  const selectedLearningGroupLabels = LEARNING_GROUP_OPTIONS.filter((option) =>
    learningGroupIds.includes(option.id),
  ).map(({ label }) => label);
  const filterScopeLabel =
    filterMethod === "academic-categories"
      ? selectedCategoryLabels.length > 0
        ? selectedCategoryLabels.join("＋")
        : groupSelection.join("＋")
      : selectedLearningGroupLabels.join("＋");

  return (
    <section className="query-card filter-card" aria-labelledby="filter-heading">
      <div className="section-heading-row">
        <div>
          <h2 id="filter-heading">篩選學校與科系</h2>
        </div>
        <span className="optional-label">可自由調整</span>
      </div>

      <div className="filter-block">
        <div className="filter-label-row">
          <h3>選擇科系篩選方式</h3>
          <span>請先選一種</span>
        </div>
        <div
          className="segmented-control group-control filter-method-control"
          role="group"
          aria-label="選擇科系篩選方式"
        >
          <button
            aria-pressed={filterMethod === "academic-categories"}
            className={
              filterMethod === "academic-categories" ? "selected" : ""
            }
            data-testid="filter-method-academic-categories"
            onClick={() => {
              setPendingBulkSelection(null);
              setProgramSearch("");
              setProgramPage(0);
              onFilterMethodChange("academic-categories");
            }}
            type="button"
          >
            <b>依類組篩選</b>
            <small>自然／社會，再細分四大類</small>
          </button>
          <button
            aria-pressed={filterMethod === "learning-groups"}
            className={filterMethod === "learning-groups" ? "selected" : ""}
            data-testid="filter-method-learning-groups"
            onClick={() => {
              setPendingBulkSelection(null);
              setProgramSearch("");
              setProgramPage(0);
              onFilterMethodChange("learning-groups");
            }}
            type="button"
          >
            <b>依十八學群篩選</b>
            <small>直接複選官方十八學群</small>
          </button>
        </div>

        {filterMethod === "academic-categories" ? (
          <div className="learning-group-filter">
            <div className="filter-label-row">
              <h3>第一步：選擇類組</h3>
              <span>可複選</span>
            </div>
            <div
              aria-label="自然組與社會組（可複選）"
              className="segmented-control group-control"
              role="group"
            >
              {(["社會組", "自然組"] as const).map((value) => (
                <button
                  aria-pressed={groupSelection.includes(value)}
                  className={groupSelection.includes(value) ? "selected" : ""}
                  data-testid={`group-${value}`}
                  key={value}
                  onClick={() => {
                    setPendingBulkSelection(null);
                    onGroupSelectionChange(
                      toggleValue(groupSelection, value),
                    );
                    setProgramSearch("");
                    setProgramPage(0);
                  }}
                  type="button"
                >
                  <b>{value}</b>
                  <small>
                    {value === "社會組"
                      ? "社會人文／財經商管"
                      : "理工資訊／生物醫農"}
                  </small>
                </button>
              ))}
            </div>

            {groupSelection.length > 0 ? (
              <>
                <div className="filter-label-row taxonomy-detail-heading">
                  <h3>第二步：細分類別</h3>
                  <span>可複選；不選即顯示整個類組</span>
                </div>
                <div
                  aria-label="四大科系類別（可複選）"
                  className="learning-group-grid"
                  role="group"
                >
                  {availableAcademicCategoryOptions.map((option) => (
                    <button
                      aria-pressed={academicCategoryIds.includes(option.id)}
                      className={
                        academicCategoryIds.includes(option.id)
                          ? "selected"
                          : ""
                      }
                      key={option.id}
                      onClick={() => {
                        setPendingBulkSelection(null);
                        onAcademicCategoryIdsChange(
                          toggleValue(academicCategoryIds, option.id),
                        );
                        setProgramSearch("");
                        setProgramPage(0);
                      }}
                      type="button"
                    >
                      <b>{option.label}</b>
                      <small>{option.admissionGroup}</small>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            <p className="microcopy">
              十八學群與校系對應取自官方資料；四大類別由十八學群重新彙整，同一校系可跨類別。
            </p>
          </div>
        ) : filterMethod === "learning-groups" ? (
          <div className="learning-group-filter">
            <div className="filter-label-row">
              <h3>選擇十八學群</h3>
              <span>可複選</span>
            </div>
            <div
              aria-label="十八學群（可複選）"
              className="learning-group-grid"
              role="group"
            >
              {LEARNING_GROUP_OPTIONS.map((option) => (
                <button
                  aria-pressed={learningGroupIds.includes(option.id)}
                  className={
                    learningGroupIds.includes(option.id) ? "selected" : ""
                  }
                  key={option.id}
                  onClick={() => {
                    setPendingBulkSelection(null);
                    onLearningGroupIdsChange(
                      toggleValue(learningGroupIds, option.id),
                    );
                    setProgramSearch("");
                    setProgramPage(0);
                  }}
                  title={option.label}
                  type="button"
                >
                  <b>{option.label}</b>
                  <small>官方對應校系</small>
                </button>
              ))}
            </div>
            <p className="microcopy">
              依大考中心與 ColleGo! 官方十八學群、學類及校系對應資料篩選；同一校系可能屬於多個學群。
            </p>
          </div>
        ) : (
          <p className="microcopy">
            先決定要用「類組」或「十八學群」篩選，之後的選項都可以複選。
          </p>
        )}
      </div>

      <div className="filter-block">
        <div className="filter-label-row">
          <h3>學校範圍</h3>
          <span>可複選</span>
        </div>
        <div
          aria-label="學校範圍（可複選）"
          className="choice-grid school-choice-grid"
          role="group"
        >
          <button
            aria-pressed={allSchoolsSelected}
            className={`choice-button ${allSchoolsSelected ? "selected" : ""}`}
            onClick={() => {
              onSchoolGroupIdsChange([]);
              onCustomSchoolIdsChange([]);
            }}
            type="button"
          >
            <span className="choice-dot" aria-hidden="true" />
            全部學校
          </button>
          {SCHOOL_GROUP_OPTIONS.map((option) => (
            <button
              aria-pressed={schoolGroupIds.includes(option.id)}
              className={`choice-button ${
                schoolGroupIds.includes(option.id) ? "selected" : ""
              }`}
              key={option.id}
              onClick={() =>
                onSchoolGroupIdsChange(toggleValue(schoolGroupIds, option.id))
              }
              type="button"
            >
              <span className="choice-dot" aria-hidden="true" />
              {option.label}
            </button>
          ))}
          <button
            aria-controls="custom-school-panel"
            aria-expanded={showCustomSchools}
            className={`choice-button ${
              customSchoolIds.length > 0 ? "selected" : ""
            } ${showCustomSchools ? "expanded" : ""}`}
            onClick={() => setShowCustomSchools((current) => !current)}
            type="button"
          >
            <span className="choice-dot" aria-hidden="true" />
            自訂複選學校
            {customSchoolIds.length > 0 ? `（${customSchoolIds.length}）` : ""}
          </button>
        </div>
        <p className="microcopy">
          已選分類與自訂學校會取聯集，例如可同時查看「四個頂大＋中字輩」。
          師範體系包含臺師大、高師大、彰師大、臺中教育與臺北教育。
        </p>
        <p className="microcopy separate-admission-note">
          本站限甄選委員會 114 申請入學 66 校總表；國防醫學院（現名國防醫學大學）、中央警察大學與科技校院等採其他招生管道，不會混入本回測。
          <RouteLink route="other-admissions">查看其他招生管道與官方連結 →</RouteLink>
        </p>

        {showCustomSchools ? (
          <div className="custom-school-panel" id="custom-school-panel">
            <label className="search-field">
              <span className="sr-only">搜尋學校</span>
              <input
                onChange={(event) => setSchoolSearch(event.target.value)}
                placeholder="搜尋校名或學校代碼"
                type="search"
                value={schoolSearch}
              />
            </label>
            <div className="custom-school-toolbar">
              <span>已選 {customSchoolIds.length} 所</span>
              {customSchoolIds.length > 0 ? (
                <button
                  className="text-button muted"
                  onClick={() => onCustomSchoolIdsChange([])}
                  type="button"
                >
                  全部清除
                </button>
              ) : null}
            </div>
            <div
              aria-label="自選學校清單"
              className="school-checklist"
              role="group"
            >
              {filteredSchools.map((school) => (
                <label className="school-check" key={school.schoolId}>
                  <input
                    checked={customSchoolIds.includes(school.schoolId)}
                    onChange={() =>
                      onCustomSchoolIdsChange(
                        toggleValue(customSchoolIds, school.schoolId),
                      )
                    }
                    type="checkbox"
                  />
                  <span className="school-check-label">
                    <b>{school.schoolId}</b>
                    <span>{school.schoolName}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="filter-block program-picker-block">
        <div className="program-picker-heading">
          <div>
            <h3>選取科系</h3>
            <span>
              {!filterMethod
                ? "請先選擇篩選方式"
                : !filterReady
                  ? filterMethod === "academic-categories"
                    ? "請至少選擇自然組或社會組"
                    : "請至少選擇一個十八學群"
                  : `${filterScopeLabel}共 ${groupDepartments.length} 個科系，已選 ${selectedCount} 個`}
            </span>
          </div>
          {filterReady ? (
            <div className="program-picker-actions">
              <button
                aria-pressed={allVisibleDepartmentsSelected}
                className="select-all-programs page-scope"
                data-testid="select-all-programs"
                disabled={visibleDepartments.length === 0}
                onClick={() =>
                  requestProgramDepartmentScope(visibleDepartments, "本頁")
                }
                type="button"
              >
                {allVisibleDepartmentsSelected
                  ? `取消本頁（${visibleDepartments.length}）`
                  : `全選本頁（${visibleDepartments.length}）`}
              </button>
              <button
                aria-pressed={allSearchResultsSelected}
                className="select-all-programs search-scope"
                data-testid="select-all-search-results"
                disabled={
                  filteredDepartments.length === 0 ||
                  programSearch.trim() === ""
                }
                onClick={() =>
                  requestProgramDepartmentScope(
                    filteredDepartments,
                    "搜尋結果",
                  )
                }
                type="button"
              >
                {programSearch.trim() === ""
                  ? "先搜尋再全選"
                  : allSearchResultsSelected
                    ? `取消搜尋結果（${filteredDepartments.length}）`
                    : `全選搜尋結果（${filteredDepartments.length}）`}
              </button>
              <button
                aria-pressed={allDepartmentsSelected}
                className="select-all-programs all-scope"
                data-testid="select-all-all-programs"
                disabled={groupDepartments.length === 0}
                onClick={() =>
                  requestProgramDepartmentScope(groupDepartments, "所有科系")
                }
                type="button"
              >
                {allDepartmentsSelected
                  ? `取消所有科系（${groupDepartments.length}）`
                  : `全選所有科系（${groupDepartments.length}）`}
              </button>
            </div>
          ) : null}
        </div>

        {pendingBulkSelection ? (
          <div className="bulk-selection-confirm" role="alert">
            <p>
              將一次選取 <b>{pendingBulkSelection.departments.length}</b> 個
              {pendingBulkSelection.label}。確定要繼續嗎？
            </p>
            <div>
              <button
                className="confirm"
                onClick={() => {
                  toggleProgramDepartmentScope(
                    pendingBulkSelection.departments,
                  );
                  setPendingBulkSelection(null);
                }}
                type="button"
              >
                確認選取 {pendingBulkSelection.departments.length} 個
              </button>
              <button
                onClick={() => setPendingBulkSelection(null)}
                type="button"
              >
                取消
              </button>
            </div>
          </div>
        ) : null}

        {!filterReady ? (
          <div className="program-picker-empty">
            <b>
              {!filterMethod
                ? "請先選擇科系篩選方式"
                : filterMethod === "academic-categories"
                  ? "請選擇自然組或社會組"
                  : "請選擇至少一個十八學群"}
            </b>
            <p>完成上方篩選後會列出符合的科系名稱，預設不勾選任何科系。</p>
          </div>
        ) : (
          <>
            <label className="program-search-field">
              <span className="sr-only">搜尋科系</span>
              <input
                data-testid="program-search"
                onChange={(event) => {
                  setPendingBulkSelection(null);
                  setProgramSearch(event.target.value);
                  setProgramPage(0);
                }}
                placeholder="輸入科系名稱或關鍵字"
                type="search"
                value={programSearch}
              />
            </label>

            <div className="program-list-summary" aria-live="polite">
              {filteredDepartments.length === 0
                ? "找不到符合關鍵字的科系"
                : `找到 ${filteredDepartments.length} 個科系・顯示 ${programStart}–${programEnd} 個`}
            </div>

            {visibleDepartments.length > 0 ? (
              <div
                aria-label={`${filterScopeLabel}科系列表`}
                className="program-checklist"
                data-page-size={programPageSize}
              >
                {visibleDepartments.map((department) => (
                  <label className="program-check" key={department.departmentName}>
                    <input
                      checked={isDepartmentSelected(department)}
                      onChange={() => toggleProgramDepartmentScope([department])}
                      type="checkbox"
                    />
                    <strong className="department-check-name">
                      {department.departmentName}
                    </strong>
                  </label>
                ))}
              </div>
            ) : null}

            {totalProgramPages > 1 ? (
              <nav className="program-pagination" aria-label="科系列表分頁">
                <button
                  disabled={visibleProgramPage === 0}
                  onClick={() => setProgramPage((page) => Math.max(0, page - 1))}
                  type="button"
                >
                  ← 前一頁
                </button>
                <span>
                  第 {visibleProgramPage + 1}／{totalProgramPages} 頁
                </span>
                <button
                  disabled={visibleProgramPage >= totalProgramPages - 1}
                  onClick={() =>
                    setProgramPage((page) =>
                      Math.min(totalProgramPages - 1, page + 1),
                    )
                  }
                  type="button"
                >
                  後一頁 →
                </button>
              </nav>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
