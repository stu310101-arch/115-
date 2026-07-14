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
  selectedDepartmentCount,
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
  matchesLearningGroupIds,
  type LearningGroupId,
} from "@/lib/learningGroups";
import type { GroupSelection } from "./queryState";
import { RouteLink } from "./PageNavigation";

export type SchoolSourceOption = {
  schoolId: string;
  schoolName: string;
};

type FilterPanelProps = {
  groupSelection: GroupSelection;
  onGroupSelectionChange: (value: GroupSelection) => void;
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
const MOBILE_PROGRAM_PAGE_SIZE = 4;
const MOBILE_PROGRAM_MEDIA_QUERY = "(max-width: 720px)";
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
  groupSelection,
  onGroupSelectionChange,
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
  const programPageSize = useProgramPageSize();

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

  const learningGroupFilteredPrograms = useMemo(
    () =>
      programOptions.filter((program) =>
        matchesLearningGroupIds(
          program.learningGroupIds,
          learningGroupIds,
        ),
      ),
    [learningGroupIds, programOptions],
  );
  const programsByGroup = useMemo(
    () => ({
      自然組: learningGroupFilteredPrograms.filter((program) =>
        program.groupTags.includes("自然組"),
      ),
      社會組: learningGroupFilteredPrograms.filter((program) =>
        program.groupTags.includes("社會組"),
      ),
    }),
    [learningGroupFilteredPrograms],
  );
  const departmentsByGroup = useMemo(
    () => ({
      自然組: toDepartmentOptions(learningGroupFilteredPrograms, "自然組"),
      社會組: toDepartmentOptions(learningGroupFilteredPrograms, "社會組"),
    }),
    [learningGroupFilteredPrograms],
  );
  const groupDepartments = useMemo<GroupedDepartmentOption[]>(
    () => {
      const departments = new Map<string, GroupedDepartmentOption>();
      groupSelection.forEach((group) => {
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
    [departmentsByGroup, groupSelection],
  );
  const selectedByGroup = {
    自然組: selectedDepartmentCount(
      programSelections.自然組,
      departmentsByGroup.自然組,
    ),
    社會組: selectedDepartmentCount(
      programSelections.社會組,
      departmentsByGroup.社會組,
    ),
  };

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
  const allDepartmentsSelected =
    groupDepartments.length > 0 && selectedCount === groupDepartments.length;

  function isDepartmentSelected(department: GroupedDepartmentOption): boolean {
    return groupSelection.every((group) => {
      const programCodes = department.programCodesByGroup[group];
      return (
        !programCodes?.length ||
        areProgramCodesSelected(programSelections[group], programCodes)
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
    groupSelection.forEach((group) => {
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

  const programStart = visibleProgramPage * programPageSize + 1;
  const programEnd = Math.min(
    filteredDepartments.length,
    programStart + programPageSize - 1,
  );

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
          <h3>選擇組別</h3>
          <span>可單選、可複選</span>
        </div>
        <div
          className="segmented-control group-control"
          role="group"
          aria-label="選擇組別（可複選）"
        >
          {(["自然組", "社會組"] as const).map((value) => (
            <button
              aria-pressed={groupSelection.includes(value)}
              className={groupSelection.includes(value) ? "selected" : ""}
              data-testid={`group-${value}`}
              key={value}
              onClick={() => {
                setProgramSearch("");
                setProgramPage(0);
                onGroupSelectionChange(toggleValue(groupSelection, value));
              }}
              type="button"
            >
              <b>{value}</b>
              <small>
                {selectedByGroup[value] === departmentsByGroup[value].length
                  ? `已全選 ${departmentsByGroup[value].length}`
                  : `已選 ${selectedByGroup[value]}`}
              </small>
            </button>
          ))}
        </div>
        <p className="microcopy">
          分組依 114 學年度官方採計科目與系名整理；自然組與社會組可同時選取，科系結果採聯集且不重複。
        </p>
        {groupSelection.length > 0 ? (
          <div className="learning-group-filter">
            <div className="filter-label-row">
              <h3>十八學群</h3>
              <span>可不選、可複選</span>
            </div>
            <div
              aria-label="十八學群（可複選）"
              className="learning-group-grid"
              role="group"
            >
              <button
                aria-pressed={learningGroupIds.length === 0}
                className={learningGroupIds.length === 0 ? "selected" : ""}
                onClick={() => {
                  onLearningGroupIdsChange([]);
                  setProgramSearch("");
                  setProgramPage(0);
                }}
                type="button"
              >
                <b>不限學群</b>
                <small>
                  {groupSelection.length === 2
                    ? "顯示兩組全部科系"
                    : `顯示${groupSelection[0]}全部科系`}
                </small>
              </button>
              {LEARNING_GROUP_OPTIONS.map((option) => (
                <button
                  aria-pressed={learningGroupIds.includes(option.id)}
                  className={
                    learningGroupIds.includes(option.id) ? "selected" : ""
                  }
                  key={option.id}
                  onClick={() => {
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
              依 ColleGo! 官方學群、學類與對應校系整理；同一學類可能跨群。官方跨領域校系不會被硬歸入任一十八學群。
            </p>
          </div>
        ) : null}
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
              {groupSelection.length === 0
                ? "先選自然組或社會組"
                : `${groupSelection.join("＋")}共 ${groupDepartments.length} 個科系，已選 ${selectedCount} 個`}
            </span>
          </div>
          {groupSelection.length > 0 ? (
            <div className="program-picker-actions">
              <button
                aria-pressed={allVisibleDepartmentsSelected}
                className="select-all-programs page-scope"
                data-testid="select-all-programs"
                disabled={visibleDepartments.length === 0}
                onClick={() => toggleProgramDepartmentScope(visibleDepartments)}
                type="button"
              >
                {allVisibleDepartmentsSelected ? "取消本頁" : "全選本頁"}
              </button>
              <button
                aria-pressed={allDepartmentsSelected}
                className="select-all-programs all-scope"
                data-testid="select-all-all-programs"
                disabled={groupDepartments.length === 0}
                onClick={() => toggleProgramDepartmentScope(groupDepartments)}
                type="button"
              >
                {allDepartmentsSelected ? "取消所有科系" : "全選所有科系"}
              </button>
            </div>
          ) : null}
        </div>

        {groupSelection.length === 0 ? (
          <div className="program-picker-empty">
            <b>請先選擇自然組或社會組</b>
            <p>選擇後會列出該組全部科系名稱，預設不勾選任何科系。</p>
          </div>
        ) : (
          <>
            <label className="program-search-field">
              <span className="sr-only">搜尋科系</span>
              <input
                data-testid="program-search"
                onChange={(event) => {
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
                aria-label={`${groupSelection.join("及")}科系列表`}
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
