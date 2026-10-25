export type ProjectRelease = {
  id: string;
  message: string;
  createdAt: string;
  /** The dev-VM snapshot this release was cut from. */
  snapshotId: string;
  state: "publishing" | "live" | "failed";
  error: string | null;
  hosting?: "static" | "server";
  url?: string;
};

export type ProjectConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Project metadata stored in Supabase, or on the dev VM for legacy deployments.
 * The dev VM's id remains the project id.
 */
export type ProjectMetadata = {
  version: 3;
  /** Explicit opt-in for disposable E2E projects. */
  e2eRunId?: string;
  name: string;
  createdAt: string;
  /**
   * The project's other VM: built and served, never edited by the agent.
   * Null until the first publish, which is what creates it.
   */
  prodVmId: string | null;
  staticProductionUrl?: string | null;
  /** Where the dev VM's live-reloading app is served. */
  previewDomain: string;
  /** Where the prod VM is served, once a release has been published. */
  productionDomain: string;
  conversations: ProjectConversationSummary[];
  releases: ProjectRelease[];
  /** The release production is currently serving. */
  liveReleaseId: string | null;
};

export type ProjectItem = {
  shellAllowed?: boolean;
  readOnly?: boolean;
  id: string;
  name: string;
  previewUrl: string;
  productionUrl: string;
  prodVmId: string | null;
  hosting?: "static" | "server";
  conversations: ProjectConversationSummary[];
  releases: ProjectRelease[];
  liveReleaseId: string | null;
};
