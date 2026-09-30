import type { Metadata } from "next";
import "./globals.css";

import AuthGuard from "../components/AuthGuard";
import RealtimeSync from "../components/RealtimeSync";

export const metadata: Metadata = {
  title: "WeiS Planner",
  description:
    "WeiS's personal cloud planner",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
    >
      <body>
        <AuthGuard>
          <RealtimeSync>
            {children}
          </RealtimeSync>
        </AuthGuard>
      </body>
    </html>
  );
}