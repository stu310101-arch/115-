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
  assert.match(html, /<title>114 申請入學一階落點查詢/);
  assert.match(html, /每一關都算清楚/);
  assert.match(html, />66<\/strong><span>所學校來源索引/);
  assert.match(html, />2168<\/strong><span>筆官方校系資料/);
  assert.match(html, /href="\/how-it-works"/);
  assert.match(html, /href="\/query"/);
  assert.match(html, /官方總表/);
  assert.doesNotMatch(
    html,
    /每一個校系都以 rules\[\] 保存多關篩選條件，必須逐關達標。/,
  );
  assert.doesNotMatch(html, /codex-preview|Codex is working|react-loading-skeleton/);
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

  assert.match(howHtml, /114 學年度學測五標/);
  assert.match(howHtml, /大學入學考試中心 114 學年度學測各科成績標準/);
  assert.match(queryHtml, /資料讀取中，請稍後/);
  assert.doesNotMatch(
    howHtml,
    /一個校系 = 一組 rules\[\]；所有 rules 通過，Program 才通過。/,
  );
  assert.doesNotMatch(queryHtml, /STEP 01—02|STEP 01|STEP 02/);
  assert.doesNotMatch(queryHtml, /class="submit-index">03/);
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
  assert.match(layout, /title:\s*"114 申請入學一階落點查詢/);
  assert.match(layout, /url: socialImageUrl/);
  assert.match(
    layout,
    /new URL\("og-share-text\.png", siteUrl\)\.toString\(\)/,
  );
  assert.match(layout, /https:\/\/stu310101-arch\.github\.io\/114-\//);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await access(new URL("../public/og-share-text.png", import.meta.url));
  await assert.rejects(access(new URL("../public/og.png", import.meta.url)));
  await assert.rejects(access(new URL("app/_sites-preview", projectRoot)));
});
