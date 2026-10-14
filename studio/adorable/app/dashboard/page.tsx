import { redirect } from "next/navigation";
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const { section } = await searchParams;
  const target = section === "tokens" ? "profile" : section || "home";
  redirect(
    [
      "home",
      "projects",
      "classrooms",
      "profile",
      "settings",
      "builders",
      "prompts",
    ].includes(target)
      ? `/${target}`
      : "/home",
  );
}
