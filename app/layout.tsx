import type { Metadata } from "next";
import { NavigationLoadingProvider } from "@/components/NavigationLoadingProvider";
import "./globals.css";

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://admission-114-review-tw.lhxuan970930.chatgpt.site/";
// Next applies `basePath` to Open Graph images during a static export.
const socialImagePath = "/og-share.png";
const faviconPath = `${basePath}/favicon.svg`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "114 申請入學一階落點查詢｜逐關倍率篩選",
  description:
    "輸入學測級分，以 114 學年度官方通過倍率篩選最低級分逐關回測，查看可能通過與接近的校系。",
  openGraph: {
    title: "114 申請入學一階落點查詢",
    description: "每一關都算清楚，看看你離目標校系有多近。",
    locale: "zh_TW",
    type: "website",
    images: [{ url: socialImagePath, width: 1536, height: 1024 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "114 申請入學一階落點查詢",
    description: "官方資料逐關回測，找出可能通過與最接近的校系。",
    images: [socialImagePath],
  },
  icons: {
    icon: faviconPath,
    shortcut: faviconPath,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>
        <NavigationLoadingProvider>{children}</NavigationLoadingProvider>
      </body>
    </html>
  );
}
