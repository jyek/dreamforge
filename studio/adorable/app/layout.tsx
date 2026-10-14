import { ModelSettingsProvider } from "@/components/assistant-ui/model-settings";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { WorkspaceFrame } from "./workspace-frame";
import { StudentGate } from "@/components/student-gate";
import "./globals.css";
import "./platform.css";
import { platformEnabled } from "@/lib/platform-auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DreamForge",
  description: "Build beautiful apps with AI",
};

function AccountGate({ children }: { children: React.ReactNode }) {
  return platformEnabled() ? (
    <>{children}</>
  ) : (
    <StudentGate>{children}</StudentGate>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full overflow-hidden">
      <body
        className={`${geistSans.variable} ${geistMono.variable} h-full overflow-hidden overscroll-none antialiased`}
      >
        <AccountGate>
          <ModelSettingsProvider>
            <WorkspaceFrame>{children}</WorkspaceFrame>
          </ModelSettingsProvider>
        </AccountGate>
      </body>
    </html>
  );
}
