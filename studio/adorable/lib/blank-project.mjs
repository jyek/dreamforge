/** Reset the sample page while retaining the framework and shadcn components. */
export const BLANK_PROJECT_COMMAND = `cd /workspace && rm -f README.md public/placeholder-freestyle-logo.svg && cat > app/page.tsx <<'PAGE'
export default function Home() {
  return null;
}
PAGE
cat > app/layout.tsx <<'LAYOUT'
import type { Metadata } from "next";

import "./globals.css";




export const metadata: Metadata = { title: "Untitled Project" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className="antialiased">{children}</body></html>;
}
LAYOUT`;

/** Repair the starter's React Day Picker v9 API and discard copied build artifacts. */
export const TEMPLATE_COMPATIBILITY_SCRIPT = `
const fs = require('fs');
const file = '/workspace/components/ui/calendar.tsx';
if (fs.existsSync(file)) {
  const original = fs.readFileSync(file, 'utf8');
  const next = original.replace(/IconLeft: \\([\\s\\S]*?IconRight: \\([\\s\\S]*?\\n        \\),/, \`Chevron: ({ className, orientation, ...props }) => orientation === 'left'
          ? <ChevronLeft className={cn("size-4", className)} {...props} />
          : <ChevronRight className={cn("size-4", className)} {...props} />,\`);
  if (next !== original) fs.writeFileSync(file, next);
}
fs.rmSync('/workspace/.next', {recursive:true, force:true});
`;
export const TEMPLATE_COMPATIBILITY_COMMAND = `node -e '${TEMPLATE_COMPATIBILITY_SCRIPT.replaceAll("'", "'\\''")}'`;
