import { PlatformAuthForm } from "@/components/platform-auth-form";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const query = await searchParams;
  return <PlatformAuthForm returnTo={query.next || ""} />;
}
