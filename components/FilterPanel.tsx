"use client";

import { useMemo, useState } from "react";
import { SCHOOL_SELECTION_OPTIONS } from "@/config/schoolGroups";
import {
  areProgramCodesSelected,
  EMPTY_PROGRAM_SELECTION,
  selectedDepartmentCount,
  selectedProgramCount,
  toDepartmentOptions,
  toggleProgramCodes,
  type ProgramOption,
  type GroupedProgramSelections,
  type ProgramSelection,
} from "@/lib/programSelection";
import type { GroupTag } from "@/lib/types";
import type { GroupSelection } from "./queryState";

export type SchoolSourceOption = {
  schoolId: string;
  schoolName: string;
};

type FilterPanelProps = {
  groupSelection: GroupSelection;
  onGroupSelectionChange: (value: Exclude<GroupSelection, "all">) => void;
  schoolSelection: string;
  onSchoolSelectionChange: (value: string) => void;
  customSchoolIds: readonly string[];
  onCustomSchoolIdsChange: (value: string[]) => void;
  programSelections: GroupedProgramSelections;
  onProgramSelectionChange: (
    group: GroupTag,
    value: ProgramSelection,
  ) => void;
  programOptions: readonly ProgramOption[];
  schoolSources: readonly SchoolSourceOption[];
};

const PROGRAM_PAGE_SIZE = 12;

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

export function FilterPanel({
  groupSelection,
  onGroupSelectionChange,
  schoolSelection,
  onSchoolSelectionChange,
  customSchoolIds,
  onCustomSchoolIdsChange,
  programSelections,
  onProgramSelectionChange,
  programOptions,
  schoolSources,
}: FilterPanelProps) {
  const [schoolSearch, setSchoolSearch] = useState("");
  const [programSearch, setProgramSearch] = useState("");
  const [programPage, setProgramPage] = useState(0);

  const filteredSchools = useMemo(() => {
    const query = schoolSearch.trim().toLocaleLowerCase("zh-Hant");
    if (!query) return schoolSources;
    return schoolSources.filter(
      (school) =>
        school.schoolId.includes(query) ||
        school.schoolName.toLocaleLowerCase("zh-Hant").includes(query),
    );
  }, [schoolSearch, schoolSources]);

  const programsByGroup = useMemo(
    () => ({
      自然組: programOptions.filter((program) =>
        program.groupTags.includes("自然組"),
      ),
      社會組: programOptions.filter((program) =>
        program.groupTags.includes("社會組"),
      ),
    }),
    [programOptions],
  );
  const groupPrograms = useMemo(
    () =>
      groupSelection === "all" ? [] : programsByGroup[groupSelection],
    [groupSelection, programsByGroup],
  );
  const departmentsByGroup = useMemo(
    () => ({
      自然組: toDepartmentOptions(programOptions, "自然組"),
      社會組: toDepartmentOptions(programOptions, "社會組"),
    }),
    [programOptions],
  );
  const groupDepartments = useMemo(
    () =>
      groupSelection === "all" ? [] : departmentsByGroup[groupSelection],
    [departmentsByGroup, groupSelection],
  );
  const programSelection =
    groupSelection === "all"
      ? EMPTY_PROGRAM_SELECTION
      : programSelections[groupSelection];
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
    const query = normalizeSearch(programSearch);
    if (!query) return groupDepartments;
    return groupDepartments.filter((department) =>
      normalizeSearch(department.departmentName).includes(query),
    );
  }, [groupDepartments, programSearch]);

  const availableProgramCodes = useMemo(
    () => groupPrograms.map((program) => program.programCode),
    [groupPrograms],
  );
  const selectedCount = selectedDepartmentCount(
    programSelection,
    groupDepartments,
  );
  const totalProgramPages = Math.max(
    1,
    Math.ceil(filteredDepartments.length / PROGRAM_PAGE_SIZE),
  );
  const visibleProgramPage = Math.min(programPage, totalProgramPages - 1);
  const visibleDepartments = filteredDepartments.slice(
    visibleProgramPage * PROGRAM_PAGE_SIZE,
    (visibleProgramPage + 1) * PROGRAM_PAGE_SIZE,
  );

  function toggleDepartment(programCodes: readonly string[]) {
    const next = toggleProgramCodes(programSelection, programCodes);
    const nextCount = selectedProgramCount(next, availableProgramCodes);
    if (nextCount === 0) {
      onProgramSelectionChange(groupSelection as GroupTag, EMPTY_PROGRAM_SELECTION);
    } else if (nextCount === availableProgramCodes.length) {
      onProgramSelectionChange(groupSelection as GroupTag, {
        mode: "all",
        codes: [],
      });
    } else {
      onProgramSelectionChange(groupSelection as GroupTag, next);
    }
  }

  const programStart = visibleProgramPage * PROGRAM_PAGE_SIZE + 1;
  const programEnd = Math.min(
    filteredDepartments.length,
    programStart + PROGRAM_PAGE_SIZE - 1,
  );

  return (
    <section className="query-card filter-card" aria-labelledby="filter-heading">
      <div className="section-heading-row">
        <div>
          <span className="step-kicker">STEP 02</span>
          <h2 id="filter-heading">篩選學校與科系</h2>
        </div>
        <span className="optional-label">可自由調整</span>
      </div>

      <div className="filter-block">
        <div className="filter-label-row">
          <h3>選擇學群</h3>
          <span>點選後展開完整科系列表</span>
        </div>
        <div className="segmented-control group-control" role="group" aria-label="選擇學群">
          {(["自然組", "社會組"] as const).map((value) => (
            <button
              aria-pressed={groupSelection === value}
              className={groupSelection === value ? "selected" : ""}
              data-testid={`group-${value}`}
              key={value}
              onClick={() => {
                if (groupSelection !== value) {
                  setProgramSearch("");
                  setProgramPage(0);
                }
                onGroupSelectionChange(value);
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
          分組依 114 學年度官方採計科目與系名整理；兩組各自選取，可同時全選。
        </p>
      </div>

      <div className="filter-block">
        <div className="filter-label-row">
          <h3>學校範圍</h3>
          <span>可選填</span>
        </div>
        <div className="choice-grid school-choice-grid" role="radiogroup" aria-label="學校範圍">
          {SCHOOL_SELECTION_OPTIONS.map((option) => (
            <button
              aria-checked={schoolSelection === option.id}
              className={`choice-button ${schoolSelection === option.id ? "selected" : ""}`}
              key={option.id}
              onClick={() => onSchoolSelectionChange(option.id)}
              role="radio"
              type="button"
            >
              <span className="choice-dot" aria-hidden="true" />
              {option.label}
            </button>
          ))}
        </div>

        {schoolSelection === "custom" ? (
          <div className="custom-school-panel">
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
            <div className="school-checklist" aria-label="自選學校清單">
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
                  <span>
                    <b>{school.schoolId}</b>
                    {school.schoolName}
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
              {groupSelection === "all"
                ? "先選自然組或社會組"
                : `${groupSelection}共 ${groupDepartments.length} 個科系，已選 ${selectedCount} 個`}
            </span>
          </div>
          {groupSelection !== "all" ? (
            <button
              aria-pressed={programSelection.mode === "all"}
              className="select-all-programs"
              data-testid="select-all-programs"
              onClick={() =>
                onProgramSelectionChange(
                  groupSelection,
                  selectedCount === groupDepartments.length
                    ? EMPTY_PROGRAM_SELECTION
                    : { mode: "all", codes: [] },
                )
              }
              type="button"
            >
              {selectedCount === groupDepartments.length ? "全部取消" : "全選"}
            </button>
          ) : null}
        </div>

        {groupSelection === "all" ? (
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
              <div className="program-checklist" aria-label={`${groupSelection}科系列表`}>
                {visibleDepartments.map((department) => (
                  <label className="program-check" key={department.departmentName}>
                    <input
                      checked={areProgramCodesSelected(
                        programSelection,
                        department.programCodes,
                      )}
                      onChange={() =>
                        toggleDepartment(department.programCodes)
                      }
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
