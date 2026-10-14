"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlatformDashboardLayout } from "./platform-dashboard-layout";
import { DreamForgeProjectArt } from "./dreamforge-brand";
export function StudentClassProjects({
  name,
  className,
  projects,
}: {
  name: string;
  className: string;
  projects: {
    vm_id: string;
    metadata: { name: string; conversations: { id: string }[] };
  }[];
}) {
  const router = useRouter();
  return (
    <PlatformDashboardLayout
      teacher={false}
      name={name}
      section="classrooms"
      onSectionChange={(s) => router.push(`/${s}`)}
    >
      <Link className="df-purple" href="/classrooms">
        ← Classrooms
      </Link>
      <div className="df-section-head">
        <h2>{className}</h2>
      </div>
      <p className="df-muted">Explore projects shared by your teacher.</p>
      {projects.length ? (
        <div className="df-projects">
          {projects.map((p, i) => (
            <Link
              key={p.vm_id}
              className="df-card df-project"
              href={`/${p.vm_id}/${p.metadata.conversations[0]?.id || ""}`}
            >
              <DreamForgeProjectArt variant={i} />
              <h3>{p.metadata.name}</h3>
              <footer>View project</footer>
            </Link>
          ))}
        </div>
      ) : (
        <div className="df-empty">
          Your teacher’s shared projects will appear here.
        </div>
      )}
    </PlatformDashboardLayout>
  );
}
