import { platformEnabled, getProfile } from "@/lib/platform-auth";
import { isPlatformAdmin } from "@/lib/admin-auth";
import { loadAdminProjects } from "@/lib/admin-showcase";
import { AdminAccessDenied, AdminShowcase } from "@/components/admin-showcase";
import { PlatformAuthForm } from "@/components/platform-auth-form";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Admin() {
  if (!platformEnabled()) notFound();
  const user = await getProfile();
  if (!user) return <PlatformAuthForm admin returnTo="/admin" />;
  if (!(await isPlatformAdmin(user.id)))
    return <AdminAccessDenied name={user.display_name} />;
  return (
    <AdminShowcase
      initialProjects={await loadAdminProjects(user.id)}
      name={user.display_name}
    />
  );
}
