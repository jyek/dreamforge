/** Reset the sample page while retaining the framework and shadcn components. */
export const BLANK_PROJECT_COMMAND = `cd /workspace && rm -f README.md public/placeholder-freestyle-logo.svg && cat > app/page.tsx <<'PAGE'
export default function Home() {
  return null;
}
PAGE
cat > app/layout.tsx <<'LAYOUT'
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = { title: "Untitled Project" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={\`\${geistSans.variable} \${geistMono.variable} antialiased\`}>{children}</body></html>;
}
LAYOUT`;
