"use client";

import { useEffect, useMemo, useState } from "react";
import {
  OTHER_ADMISSION_CATEGORIES,
  OTHER_ADMISSION_ENTRIES,
  OTHER_ADMISSION_SOURCES,
  type OtherAdmissionCategory,
} from "@/config/otherAdmissions";

type CategoryFilter = "全部" | OtherAdmissionCategory;

const PAGE_SIZE = 12;

function normalizeSearch(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-Hant")
    .replace(/[\s\u3000·．，、（）()\-_/]+/gu, "");
}

export function OtherAdmissionsDirectory() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("全部");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 720px)");
    const syncPageSize = () => {
      setPageSize(mediaQuery.matches ? 6 : PAGE_SIZE);
      setPage(0);
    };
    syncPageSize();
    mediaQuery.addEventListener("change", syncPageSize);
    return () => mediaQuery.removeEventListener("change", syncPageSize);
  }, []);

  const filteredEntries = useMemo(() => {
    const query = normalizeSearch(search);
    return OTHER_ADMISSION_ENTRIES.filter((entry) => {
      if (category !== "全部" && entry.category !== category) return false;
      if (!query) return true;
      return normalizeSearch(
        [entry.code, entry.name, ...(entry.aliases ?? [])]
          .filter(Boolean)
          .join(" "),
      ).includes(query);
    });
  }, [category, search]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const visiblePage = Math.min(page, totalPages - 1);
  const visibleEntries = filteredEntries.slice(
    visiblePage * pageSize,
    (visiblePage + 1) * pageSize,
  );
  const resultStart =
    filteredEntries.length === 0 ? 0 : visiblePage * pageSize + 1;
  const resultEnd = Math.min(
    filteredEntries.length,
    (visiblePage + 1) * pageSize,
  );

  function updateCategory(nextCategory: CategoryFilter) {
    setCategory(nextCategory);
    setPage(0);
  }

  return (
    <>
      <section className="other-admission-scope" aria-labelledby="other-scope-title">
        <div>
          <span className="step-kicker">資料範圍</span>
          <h1 id="other-scope-title">找不到的學校，不一定是資料漏抓</h1>
        </div>
        <p>
          本站的一階回測已完整收錄
          <a
            href={OTHER_ADMISSION_SOURCES.cac.url}
            rel="noreferrer"
            target="_blank"
          >
            甄選委員會 114 申請入學官方總表的 <strong>66 所學校</strong>
          </a>
          。軍事院校、警政院校、科技校院與部分單獨招生學校使用不同招生系統，
          所以不會混入同一套倍率篩選回測；你可以在這裡找到它們的官方招生管道。
        </p>
      </section>

      <section className="other-source-grid" aria-label="各類招生官方主來源">
        <a
          href={OTHER_ADMISSION_SOURCES.military.url}
          rel="noreferrer"
          target="_blank"
        >
          <span>軍事院校</span>
          <b>國防部軍事學校正期班</b>
          <small>查看官方來源 ↗</small>
        </a>
        <a
          href={OTHER_ADMISSION_SOURCES.policeUniversity.url}
          rel="noreferrer"
          target="_blank"
        >
          <span>警政院校</span>
          <b>中央警察大學招生</b>
          <small>查看官方來源 ↗</small>
        </a>
        <a
          href={OTHER_ADMISSION_SOURCES.technology.url}
          rel="noreferrer"
          target="_blank"
        >
          <span>科技校院</span>
          <b>JCTV 四技申請入學</b>
          <small>114 學年度共 59 校 ↗</small>
        </a>
        <a
          href={OTHER_ADMISSION_SOURCES.moe.url}
          rel="noreferrer"
          target="_blank"
        >
          <span>其他管道</span>
          <b>教育部大專校院一覽表</b>
          <small>另附各校官方簡章 ↗</small>
        </a>
      </section>

      <section className="other-directory" aria-labelledby="other-directory-title">
        <div className="other-directory-heading">
          <div>
            <span className="step-kicker">OTHER ADMISSIONS</span>
            <h2 id="other-directory-title">搜尋其他招生學校</h2>
          </div>
          <p>
            共 {OTHER_ADMISSION_ENTRIES.length} 筆官方管道索引；每頁最多 {PAGE_SIZE} 筆。
          </p>
        </div>

        <div className="other-directory-tools">
          <label className="other-admission-search">
            <span className="sr-only">搜尋學校名稱、別名或科技校院代碼</span>
            <input
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
              placeholder="搜尋校名、別名或科技校院代碼"
              type="search"
              value={search}
            />
          </label>

          <div
            className="other-category-filter"
            role="group"
            aria-label="招生管道分類"
          >
            {(["全部", ...OTHER_ADMISSION_CATEGORIES] as const).map(
              (option) => (
                <button
                  aria-pressed={category === option}
                  className={category === option ? "selected" : ""}
                  key={option}
                  onClick={() => updateCategory(option)}
                  type="button"
                >
                  {option}
                </button>
              ),
            )}
          </div>
        </div>

        <div className="other-result-summary" aria-live="polite">
          {filteredEntries.length === 0
            ? "找不到符合條件的學校"
            : `找到 ${filteredEntries.length} 筆，顯示第 ${resultStart}～${resultEnd} 筆`}
        </div>

        {visibleEntries.length > 0 ? (
          <div className="other-admission-list">
            {visibleEntries.map((entry) => (
              <article className="other-admission-card" key={entry.id}>
                <div className="other-admission-card-meta">
                  <span>{entry.category}</span>
                  {entry.code ? <b>代碼 {entry.code}</b> : null}
                </div>
                <h3>{entry.name}</h3>
                {entry.aliases && entry.aliases.length > 0 ? (
                  <p>別名：{entry.aliases.join("、")}</p>
                ) : null}
                {entry.note ? <p className="other-admission-card-note">{entry.note}</p> : null}
                <a
                  aria-label={`${entry.name}官方招生資訊（另開新分頁）`}
                  href={entry.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  前往官方招生資訊 <span aria-hidden="true">↗</span>
                </a>
              </article>
            ))}
          </div>
        ) : (
          <div className="other-admission-empty">
            <b>沒有符合的學校</b>
            <p>可改用校名的一部分、常用簡稱或科技校院三碼代碼搜尋。</p>
          </div>
        )}

        <nav className="other-admission-pagination" aria-label="其他招生學校分頁">
          <button
            disabled={visiblePage === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            type="button"
          >
            ← 前一頁
          </button>
          <span>
            第 {visiblePage + 1} / {totalPages} 頁
          </span>
          <button
            disabled={visiblePage >= totalPages - 1}
            onClick={() =>
              setPage((current) => Math.min(totalPages - 1, current + 1))
            }
            type="button"
          >
            後一頁 →
          </button>
        </nav>
      </section>

      <aside className="other-admission-warning">
        此頁只提供官方招生入口，不把不同制度的門檻硬套進 CAC 66 校回測。法鼓文理學院、臺灣戲曲學院與兩所空中大學不適用 CAC 學測回測；臺灣警察專科學校 114 招收二年制專科警員班，非學士班且不採學測。軍事、警政或其他特殊招生也可能另有資格、體檢、口試、體能或專業項目，請以各校當年度官方簡章為準。
      </aside>
    </>
  );
}
