export const OTHER_ADMISSION_CATEGORIES = [
  "軍事院校",
  "警政院校",
  "科技校院",
  "其他管道",
] as const;

export type OtherAdmissionCategory =
  (typeof OTHER_ADMISSION_CATEGORIES)[number];

export type OtherAdmissionEntry = {
  id: string;
  name: string;
  category: OtherAdmissionCategory;
  code?: string;
  aliases?: readonly string[];
  note?: string;
  sourceLabel: string;
  sourceUrl: string;
};

export const OTHER_ADMISSION_SOURCES = {
  cac: {
    label: "甄選委員會 115 申請入學 64 校官方總表",
    url: "https://www.cac.edu.tw/apply115/system/ColQry_115xappLyfOrStu_Azd5gP29/TotalGsdShow.htm",
  },
  military: {
    label: "國防部 114 學年度軍事學校正期班甄選入學",
    url: "https://navy.mnd.gov.tw/policyroom/Policy_Info.aspx?CID=30249&ID=7&PID=239",
  },
  policeUniversity: {
    label: "中央警察大學 114 學年度學士班招生",
    url: "https://daa.cpu.edu.tw/p/406-1033-43854%2Cr35.php",
  },
  technology: {
    label: "JCTV 114 學年度四技申請入學招生學校",
    url: "https://www.jctv.ntut.edu.tw/caac/contents.php?academicYear=114&subId=105",
  },
  moe: {
    label: "教育部 114 學年度大專校院一覽表",
    url: "https://udb.moe.edu.tw/ulist/Resource",
  },
} as const;

const MILITARY_ENTRIES: readonly OtherAdmissionEntry[] = [
  "陸軍軍官學校",
  "海軍軍官學校",
  "空軍軍官學校",
  "國防大學政治作戰學院",
  "國防大學管理學院",
  "國防大學理工學院",
].map((name, index) => ({
  id: `military-${index + 1}`,
  name,
  category: "軍事院校",
  sourceLabel: OTHER_ADMISSION_SOURCES.military.label,
  sourceUrl: OTHER_ADMISSION_SOURCES.military.url,
}));

const NATIONAL_DEFENSE_MEDICAL_ENTRY: OtherAdmissionEntry = {
  id: "military-7",
  name: "國防醫學院",
  aliases: ["國防醫學大學", "114年8月1日起現名"],
  category: "軍事院校",
  sourceLabel: OTHER_ADMISSION_SOURCES.military.label,
  sourceUrl: OTHER_ADMISSION_SOURCES.military.url,
};

const POLICE_UNIVERSITY_ENTRY: OtherAdmissionEntry = {
  id: "police-university",
  name: "中央警察大學",
  aliases: ["警大"],
  category: "警政院校",
  sourceLabel: OTHER_ADMISSION_SOURCES.policeUniversity.label,
  sourceUrl: OTHER_ADMISSION_SOURCES.policeUniversity.url,
};

const JCTV_SCHOOLS = [
  ["101", "國立臺灣科技大學", ["臺科大", "台科大"]],
  ["102", "國立雲林科技大學", ["雲科大"]],
  ["103", "國立屏東科技大學", ["屏科大"]],
  ["104", "國立臺北科技大學", ["北科大"]],
  ["105", "國立高雄科技大學", ["高科大"]],
  ["107", "國立虎尾科技大學", ["虎科大"]],
  ["109", "國立澎湖科技大學", ["澎科大"]],
  ["110", "國立勤益科技大學", ["勤益科大"]],
  ["111", "國立臺北護理健康大學", ["北護大"]],
  ["112", "國立高雄餐旅大學", ["高餐大"]],
  ["113", "國立臺中科技大學", ["中科大"]],
  ["114", "國立臺北商業大學", ["北商大"]],
  ["201", "朝陽科技大學"],
  ["202", "南臺科技大學", ["南台科技大學", "南臺科大"]],
  ["203", "崑山科技大學"],
  ["204", "嘉藥學校財團法人嘉南藥理大學", ["嘉南藥理大學", "嘉藥"]],
  ["205", "樹德科技大學"],
  ["206", "龍華科技大學"],
  ["207", "輔英科技大學"],
  ["208", "明新科技大學"],
  ["209", "弘光科技大學"],
  ["210", "健行科技大學"],
  ["211", "正修科技大學"],
  ["212", "萬能科技大學"],
  ["213", "建國科技大學"],
  ["214", "明志科技大學"],
  ["215", "台鋼科技大學", ["臺鋼科技大學", "台鋼科大"]],
  ["216", "大仁科技大學"],
  ["217", "聖約翰科技大學"],
  ["218", "嶺東科技大學"],
  ["219", "中國科技大學"],
  ["220", "中臺科技大學", ["中台科技大學"]],
  ["221", "台南應用科技大學", ["臺南應用科技大學"]],
  ["222", "中信科技大學"],
  ["223", "元培醫事科技大學"],
  ["224", "景文科技大學"],
  ["225", "中華醫事科技大學"],
  ["226", "東南科技大學"],
  ["227", "德明財經科技大學"],
  ["228", "南開科技大學"],
  ["229", "中華科技大學"],
  ["230", "僑光科技大學"],
  ["231", "育達科技大學"],
  ["232", "美和科技大學"],
  ["233", "吳鳳科技大學"],
  ["236", "修平科技大學"],
  ["237", "長庚學校財團法人長庚科技大學", ["長庚科技大學", "長庚科大"]],
  ["238", "敏實科技大學"],
  ["239", "臺北城市科技大學", ["台北城市科技大學"]],
  ["240", "醒吾科技大學"],
  ["241", "文藻外語大學"],
  ["245", "致理科技大學"],
  ["246", "宏國德霖科技大學"],
  ["248", "崇右影藝科技大學"],
  ["249", "台北海洋科技大學", ["臺北海洋科技大學"]],
  ["250", "亞東科技大學"],
  ["411", "南亞技術學院"],
  ["415", "黎明技術學院"],
  ["417", "德育學校財團法人德育護理健康學院", ["德育護理健康學院"]],
] as const satisfies readonly (
  | readonly [string, string]
  | readonly [string, string, readonly string[]]
)[];

export const JCTV_114_ENTRIES: readonly OtherAdmissionEntry[] = JCTV_SCHOOLS.map(
  ([code, name, aliases]) => ({
    id: `jctv-${code}`,
    code,
    name,
    aliases,
    category: "科技校院",
    sourceLabel: OTHER_ADMISSION_SOURCES.technology.label,
    sourceUrl: OTHER_ADMISSION_SOURCES.technology.url,
  }),
);

const OTHER_ROUTE_ENTRIES: readonly OtherAdmissionEntry[] = [
  {
    id: "dila",
    name: "法鼓學校財團法人法鼓文理學院",
    aliases: ["法鼓文理學院"],
    note: "114 為單獨招生，不適用 CAC 學測倍率篩選回測。",
    category: "其他管道",
    sourceLabel: "法鼓文理學院 114 學年度佛教學系學士班單獨招生簡章",
    sourceUrl:
      "https://www.dila.edu.tw/files/Handbook/114%E5%AD%B8%E5%B9%B4/%E9%99%84%E4%BB%B63_114%E5%AD%B8%E5%B9%B4%E5%BA%A6%E4%BD%9B%E6%95%99%E5%AD%B8%E7%B3%BB%E5%AD%B8%E5%A3%AB%E7%8F%AD%E5%96%AE%E7%8D%A8%E6%8B%9B%E7%94%9F%E8%80%83%E8%A9%A6%E7%B0%A1%E7%AB%A0.pdf",
  },
  {
    id: "tcpa",
    name: "國立臺灣戲曲學院",
    aliases: ["臺灣戲曲學院", "台灣戲曲學院"],
    note: "需特殊檢定，詳情請至官方網站查詢；不適用 CAC 學測回測。",
    category: "其他管道",
    sourceLabel: "國立臺灣戲曲學院官方招生資訊",
    sourceUrl:
      "https://www.tcpa.edu.tw/p/406-1000-44073%2Cr302.php?Lang=zh-tw",
  },
  {
    id: "nou",
    name: "國立空中大學",
    aliases: ["空大"],
    note: "114 大學部免入學考試，不適用 CAC 學測倍率篩選回測。",
    category: "其他管道",
    sourceLabel: "國立空中大學 114 學年度招生簡章",
    sourceUrl: "https://studadm.nou.edu.tw/FileUploads/File/794/11432701.pdf",
  },
  {
    id: "ouk",
    name: "高雄市立空中大學",
    aliases: ["高雄空大"],
    note: "114 學年度免入學考試，不適用 CAC 學測倍率篩選回測。",
    category: "其他管道",
    sourceLabel: "高雄市立空中大學 114 學年度招生簡章",
    sourceUrl:
      "https://www.ouk.edu.tw/FileDownLoad/FileUpload/20250703161727074134.pdf",
  },
  {
    id: "tpa",
    name: "臺灣警察專科學校",
    aliases: ["台灣警察專科學校", "警專"],
    note: "114 為二年制專科警員班，非學士班且不採學測。",
    category: "其他管道",
    sourceLabel: "臺灣警察專科學校官方招生簡章",
    sourceUrl: "https://exam.tpa.edu.tw/var/file/22/1022/img/336/351254907.pdf",
  },
];

export const OTHER_ADMISSION_ENTRIES: readonly OtherAdmissionEntry[] = [
  ...MILITARY_ENTRIES,
  NATIONAL_DEFENSE_MEDICAL_ENTRY,
  POLICE_UNIVERSITY_ENTRY,
  ...JCTV_114_ENTRIES,
  ...OTHER_ROUTE_ENTRIES,
];
