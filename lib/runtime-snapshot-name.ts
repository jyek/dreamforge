/** Runtime names are identifiers; retain human labels in DreamForge's run events. */
export function runtimeSnapshotName(label: string) {
  return (
    label
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^[^A-Za-z0-9]+/, "")
      .slice(0, 128) || "snapshot"
  );
}
