import {
  DreamForgeBrand,
  DreamForgeProjectArt,
} from "@/components/dreamforge-brand";
import { database } from "@/lib/database";
import Link from "next/link";
import { platformEnabled } from "@/lib/platform-auth";
// Project examples come from the live database, not the build environment.
export const dynamic = "force-dynamic";

export default async function Examples() {
  const { rows } = await database().query(
    platformEnabled()
      ? "select vm_id,metadata from adorable.projects where is_example order by updated_at desc"
      : "select vm_id,metadata from adorable.projects order by updated_at desc",
  );
  return (
    <main className="df-page">
      <header className="df-header">
        <DreamForgeBrand />
        <Link href="/login" className="df-button secondary">
          Your studio →
        </Link>
      </header>
      <div className="df-container">
        <p className="df-eyebrow">A little inspiration</p>
        <h1 className="df-title">Big ideas start small.</h1>
        <p className="df-muted">
          Explore these separate demo examples. Your own creations belong in
          your studio.
        </p>
        <div className="df-projects" style={{ marginTop: 35 }}>
          {rows.map((p, index) => (
            <Link
              className="df-card df-project"
              key={p.vm_id}
              href={`/${p.vm_id}/${p.metadata.conversations[0]?.id || ""}`}
            >
              <DreamForgeProjectArt variant={index} />
              <h3>{p.metadata.name}</h3>
              <p className="df-muted">Demo example</p>
              <footer>Explore ↗</footer>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
