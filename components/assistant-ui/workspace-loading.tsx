import { DreamLoading, SimpleLoading } from "../dream-loading";
export function WorkspaceLoading({
  label = "Loading conversation…",
  fullPanel = false,
}: {
  label?: string;
  fullPanel?: boolean;
}) {
  return fullPanel ? (
    <DreamLoading label={label} className="h-full min-h-32" />
  ) : (
    <SimpleLoading label={label} className="h-full min-h-32" />
  );
}
