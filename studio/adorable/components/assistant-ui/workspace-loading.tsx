import { DreamLoading } from "../dream-loading";
export function WorkspaceLoading({
  label = "Loading conversation…",
}: {
  label?: string;
}) {
  return <DreamLoading label={label} className="h-full min-h-32" />;
}
