/** Display readiness is separate from compilation or interaction verification. */
export const PREVIEW_READY_MESSAGE = "dreamforge:preview-html-ready";
export function isPreviewReadyMessage(
  event: Pick<MessageEvent, "source" | "data">,
  frame: Window | null | undefined,
) {
  return (
    !!frame &&
    event.source === frame &&
    event.data?.type === PREVIEW_READY_MESSAGE
  );
}
