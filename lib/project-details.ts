/** Validate editable project metadata; omitted descriptions preserve existing text. */
export function projectDetailsPatch(body: unknown): {
  name: string;
  description?: string;
} {
  const value =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name))
    throw Error(
      "Enter a project name between 1 and 80 characters, without control characters.",
    );
  if (value.description === undefined) return { name };
  if (
    typeof value.description !== "string" ||
    value.description.trim().length > 500 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.description)
  )
    throw Error(
      "Enter a description of up to 500 characters, without control characters.",
    );
  return { name, description: value.description.trim() };
}
