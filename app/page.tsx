import { RouteLink } from "@/components/PageNavigation";
import programsJson from "@/data/programs_114.json";
import sourcesJson from "@/data/sources_114.json";
import {
  supportsAcademicPartialEvaluation,
  supportsProgramEvaluation,
} from "@/lib/admission";
import type { Program } from "@/lib/types";

type SchoolSource = {
  collegeListUrl: string;
};

export default function Home() {
  const programs = programsJson as Program[];
  const schoolSources = sourcesJson as SchoolSource[];
  const testableProgramCount = programs.filter((program) => {
    if (supportsProgramEvaluation(program)) return true;
    return (
      program.reviewReasons?.some((reason) =>
        reason.startsWith("需特殊檢定"),
      ) === true && supportsAcademicPartialEvaluation(program)
    );
  }).length;
  const unresolvedProgramCount = programs.length - testableProgramCount;
  const officialListUrl = schoolSources[0]?.collegeListUrl ?? "#";

  return (
    <main className="home-page">
      <header className="home-header">
        <div className="wordmark" aria-label="114 申請一階落點">
          <span className="wordmark-seal">114</span>
          <span>
            <b>申請一階落點</b>
            <small>倍率篩選回測工具</small>
          </span>
        </div>
      </header>

      <section className="hero home-hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="live-dot" aria-hidden="true" />
            114 學年度・官方資料回測
          </div>
          <h1 id="home-title">
            每一關都算清楚，
            <span>看看你離目標校系有多近。</span>
          </h1>
          <p className="hero-lead">
            輸入學測級分，系統會逐關加總官方通過倍率篩選最低級分，
            找出可能通過的校系，也告訴你最少可以補哪幾科。
          </p>
          <div className="hero-actions" aria-label="首頁功能">
            <RouteLink className="secondary-cta" route="how-it-works">
              網站介紹 <span aria-hidden="true">→</span>
            </RouteLink>
            <RouteLink className="primary-cta" route="query">
              開始 <span aria-hidden="true">→</span>
            </RouteLink>
            <a
              className="secondary-cta"
              href={officialListUrl}
              rel="noreferrer"
              target="_blank"
            >
              官方總表 <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>

        <aside className="hero-proof" aria-label="資料收錄狀態">
          <span className="proof-kicker">DATA STATUS</span>
          <div className="proof-grid">
            <div>
              <strong className="proof-number" data-testid="official-program-count">
                {programs.length}
              </strong>
              <span>筆官方資料總數</span>
            </div>
            <div>
              <strong className="proof-number">{testableProgramCount}</strong>
              <span>筆可做學測試算</span>
            </div>
            <div>
              <strong className="proof-number">{unresolvedProgramCount}</strong>
              <span>筆無法獨立試算</span>
            </div>
          </div>
          <div className="proof-rule">
            <span>資料範圍</span>
            <code>{schoolSources.length} 校・未含下一學年度門檻</code>
          </div>
        </aside>
      </section>
    </main>
  );
}
