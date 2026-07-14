import {
  PageNavigation,
  SubpageHeader,
} from "@/components/PageNavigation";
import { GSAT_114_FIVE_STANDARDS } from "@/lib/subjects";

const GSAT_SUBJECTS = ["國文", "英文", "數A", "數B", "社會", "自然"] as const;
const FIVE_STANDARDS = ["頂標", "前標", "均標", "後標", "底標"] as const;

export default function HowItWorksPage() {
  return (
    <main className="subpage-main method-page">
      <SubpageHeader kicker="HOW IT WORKS" title="網站介紹" />

      <section className="method-section standalone-method" aria-labelledby="method-title">
        <div className="method-heading">
          <span>逐關回測</span>
          <h1 id="method-title">不是算一個總分，而是逐關判斷。</h1>
        </div>
        <p className="method-lead">
          系統依 114 學年度官方通過倍率篩選最低級分回測。若一個校系有多關篩選，
          每一關都會使用自己的科目組合與門檻，所有關卡通過才列為可能通過。
        </p>

        <div className="method-grid">
          <article>
            <span>01</span>
            <h2>每關獨立加總</h2>
            <p>每一筆規則都有自己的科目組合與最低級分，不共用單一總分。</p>
          </article>
          <article>
            <span>02</span>
            <h2>全部過關才算通過</h2>
            <p>多關校系必須每一關都達標；任一關不足，結果會列出該關差距。</p>
          </article>
          <article>
            <span>03</span>
            <h2>搜尋最少補分</h2>
            <p>只搜尋該校系用到的科目，並遵守單科最高 15 級分。</p>
          </article>
        </div>

        <div className="formula-card">
          <span>一筆規則</span>
          <code>sum(使用者科目級分) ≥ 官方通過篩選最低級分</code>
        </div>

        <section className="five-standard-section" aria-labelledby="five-standard-title">
          <div className="five-standard-heading">
            <span>官方換算基準</span>
            <h2 id="five-standard-title">114 學年度學測五標</h2>
            <p>校系檢定條件若採頂標、前標、均標、後標或底標，系統會依下表換算為級分。</p>
          </div>

          <div className="five-standard-table-wrap">
            <table className="five-standard-table">
              <caption>114 學年度學科能力測驗各科成績標準</caption>
              <thead>
                <tr>
                  <th scope="col">科目</th>
                  {FIVE_STANDARDS.map((standard) => (
                    <th scope="col" key={standard}>{standard}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {GSAT_SUBJECTS.map((subject) => (
                  <tr key={subject}>
                    <th scope="row">{subject}</th>
                    {FIVE_STANDARDS.map((standard) => (
                      <td key={standard}>
                        {GSAT_114_FIVE_STANDARDS[subject][standard]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="five-standard-source">
            資料來源：
            <a
              href="https://www.ceec.edu.tw/xmdoc/cont?sid=0P055615788466837352&xsmsid=0J018604485538810196"
              rel="noreferrer"
              target="_blank"
            >
              大學入學考試中心 114 學年度學測各科成績標準
            </a>
          </p>
        </section>

        <aside className="method-notice">
          本網站提供歷史資料回測，不代表下一學年度一定通過；正式選填前仍應回查甄選委員會公告。
        </aside>
      </section>

      <PageNavigation
        nextLabel="下一頁：開始輸入"
        nextRoute="query"
        previousLabel="前一頁：首頁"
        previousRoute="home"
      />
    </main>
  );
}
