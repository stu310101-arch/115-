import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the finished homepage and complete data status", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>115 申請入學一階落點查詢/);
  assert.match(html, /每一關都算清楚/);
  assert.match(html, />2206<\/strong><span>筆官方資料總數/);
  assert.match(html, />2152<\/strong><span>筆可做學測試算/);
  assert.match(html, />54<\/strong><span>筆無法獨立試算/);
  assert.doesNotMatch(html, /這是 115 歷史資料回測/);
  assert.doesNotMatch(html, /不是 115／下一年度落點預測/);
  assert.match(html, /href="\/how-it-works"/);
  assert.match(html, /href="\/query"/);
  assert.match(html, /官方總表/);
  assert.doesNotMatch(
    html,
    /每一個校系都以 rules\[\] 保存多關篩選條件，必須逐關達標。/,
  );
  assert.doesNotMatch(html, /codex-preview|Codex is working|react-loading-skeleton/);
});

test("server-renders all three year sites and marks 115 as current", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(
    html,
    /<nav aria-label="切換回測學年度" class="year-switcher year-switcher--home">/,
  );
  assert.match(html, /href="https:\/\/stu310101-arch\.github\.io\/113-\/"/);
  assert.match(html, /href="https:\/\/stu310101-arch\.github\.io\/114-\/"/);
  assert.match(
    html,
    /aria-current="page"[^>]*>115 年度・目前<\/span>/,
  );
});

test("server-renders every requested site page", async () => {
  const cases = [
    ["/how-it-works", /HOW IT WORKS|網站怎麼判斷/],
    ["/other-admissions", /咦，這間學校去哪了？/],
    ["/query", /資料讀取中，請稍後/],
    ["/results", /資料讀取中，請稍後/],
  ];

  for (const [pathname, expected] of cases) {
    const response = await render(pathname);
    assert.equal(response.status, 200, pathname);
    assert.match(await response.text(), expected, pathname);
  }
});

test("renders the official five-standard reference and navigation loading UI", async () => {
  const [howResponse, queryResponse] = await Promise.all([
    render("/how-it-works"),
    render("/query"),
  ]);
  const howHtml = await howResponse.text();
  const queryHtml = await queryResponse.text();

  assert.match(howHtml, /115 學年度學測五標/);
  assert.match(howHtml, /大學入學考試中心 115 學年度學測各科成績標準/);
  assert.match(queryHtml, /資料讀取中，請稍後/);
  assert.doesNotMatch(
    howHtml,
    /一個校系 = 一組 rules\[\]；所有 rules 通過，Program 才通過。/,
  );
  assert.doesNotMatch(queryHtml, /STEP 01—02|STEP 01|STEP 02/);
  assert.doesNotMatch(queryHtml, /class="submit-index">03/);
});

test("keeps APCS optional while exposing separate APCS and GSAT outcomes", async () => {
  const [scoreForm, resultTable] = await Promise.all([
    readFile(new URL("../components/ScoreForm.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../components/ProgramResultTable.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(scoreForm, /APCS 成績（選填）/);
  assert.match(scoreForm, /留白不會當成 0 級或直接判定未通過/);
  assert.match(resultTable, /APCS 尚未填完整；留白不會被當成 0 級或直接淘汰/);
  assert.match(resultTable, /學測與 APCS 未通過/);
  assert.match(resultTable, /APCS 未通過/);
  assert.match(resultTable, /學測未通過/);
});

test("guards filter switches and keeps mobile result controls compact", async () => {
  const [filterPanel, queryWorkspace, resultsWorkspace, css] =
    await Promise.all([
      readFile(new URL("../components/FilterPanel.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../components/QueryWorkspace.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../components/ResultsWorkspace.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    ]);

  assert.match(filterPanel, /切換方式將清除目前/);
  assert.match(filterPanel, />\s*取消\s*<\/button>/);
  assert.match(filterPanel, />\s*確認切換\s*<\/button>/);
  assert.match(queryWorkspace, /programSelections: EMPTY_GROUPED_PROGRAM_SELECTIONS/);
  assert.match(queryWorkspace, /showNext=\{false\}/);
  assert.match(resultsWorkspace, /RESULT_MOBILE_PAGE_SIZE = 10/);
  assert.match(
    css,
    /@media \(max-width: 720px\)[\s\S]*?\.result-tabs \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/,
  );
});

test("keeps the homepage header static and removes starter preview files", async () => {
  const [css, page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(
    css,
    /\.home-header,\s*\n\.subpage-header\s*\{[^}]*position:\s*static/s,
  );
  assert.match(page, /route="how-it-works"/);
  assert.match(page, /route="query"/);
  assert.match(layout, /title:\s*"115 申請入學一階落點查詢/);
  assert.match(layout, /url: socialImageUrl/);
  assert.match(
    layout,
    /new URL\("og-share-115\.png", siteUrl\)\.toString\(\)/,
  );
  assert.match(layout, /https:\/\/stu310101-arch\.github\.io\/115-\//);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await access(new URL("../public/og-share-115.png", import.meta.url));
  await assert.rejects(access(new URL("../public/og.png", import.meta.url)));
  await assert.rejects(access(new URL("app/_sites-preview", projectRoot)));
});
