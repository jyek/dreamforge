import { PlatformAuthForm } from "@/components/platform-auth-form";
export default async function Signup({
  searchParams,
}: {
  searchParams: Promise<{
    teacherInvite?: string;
    next?: string;
    classCode?: string;
  }>;
}) {
  const query = await searchParams;
  return (
    <PlatformAuthForm
      signup
      classCode={query.classCode || ""}
      teacherInvite={query.teacherInvite || ""}
      returnTo={query.next || ""}
    />
  );
}
