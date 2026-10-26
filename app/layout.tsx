import { ModelSettingsProvider } from "@/components/assistant-ui/model-settings";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { WorkspaceFrame } from "./workspace-frame";
import { demoMode } from "@/lib/demo-mode";
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
  title: "The safer way for students to learn and build with AI",
  description: "Build beautiful apps with AI",
  icons: {
    icon: {
      url: "/brand/dreamforge-favicon.svg",
      type: "image/svg+xml",
      sizes: "any",
    },
  },
};

function AccountGate({ children }: { children: React.ReactNode }) {
  if (platformEnabled() || demoMode()) return <>{children}</>;
  return (
    <main className="p-8">
      Enable DreamForge account login to open this workspace.
    </main>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full overflow-hidden"
      data-database-schema="dreamforge"
    >
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
