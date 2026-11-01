/** SSR headings can be visible before the preview's button handlers load. */
export async function waitForPreviewReady(page, heading) {
  const frame = page.frameLocator("iframe").first();
  await frame.getByRole("heading", { name: heading, exact: true }).waitFor();
  const child = page.frames().find((f) => f.parentFrame() === page.mainFrame());
  if (!child) throw Error("Preview frame was not found");
  await child.waitForLoadState("networkidle", { timeout: 30000 });
  return frame;
}
