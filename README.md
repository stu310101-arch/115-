# 115 申請入學一階落點查詢

以大學甄選入學委員會 115 學年度「通過倍率篩選最低級分」逐關回測學測成績。核心不是單一總分，而是每個校系各自的 `screeningRules[]`；所有規則通過，校系才通過。

## 開發

需要 Node.js 22（22.13 以上）。

```powershell
npm install
npm run dev
npm test
npm run data:validate
npm run build
```

## 資料流程

- `npm run data:fetch`：從官方 `collegeList.htm` 重建 64 所學校來源索引。
- `data/programs_115.json`：人工校對後的校系規則；每筆都保留官方報表網址。
- `npm run data:validate`：檢查校系代碼、規則、門檻、來源網址與校對狀態。
- 正式查詢只接受 `verified: true` 的資料。

## 判斷核心

`lib/admission.ts` 的 `evaluateProgram(program, scores)` 會：

1. 逐關計算 `sum(rule.subjects) >= rule.minScore`。
2. 彙整所有未通過規則與未輸入科目。
3. 在單科最高 15 級分下，搜尋最少總加分的可行補分組合。

本工具僅供 115 學年度回測與落點參考，不代表未來年度一定通過。
