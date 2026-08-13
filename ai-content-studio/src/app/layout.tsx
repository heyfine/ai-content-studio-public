import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Content Studio",
  description: "个人 AI 内容生产工作台：选题、AI 写作、SEO、发布 WordPress",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
      style={{
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
      }}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
