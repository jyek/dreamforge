import type { UIMessage } from "ai";
import type { ModelChoice } from "./model-catalog";

export const DEMO_PROMPT_LIMIT = 32_000;
export const DEMO_CONVERSATION_BYTES = 3_500_000;
const IMAGE_BYTES = 2 * 1024 * 1024;
export const supportsImages = (_choice: ModelChoice) => true;
export class ChatInputError extends Error {}

/** Image bytes have their own size limit and never count as prompt text. */
export function demoChatInput(
  message: UIMessage | undefined,
  choice: ModelChoice,
) {
  if (message?.role !== "user" || !Array.isArray(message.parts))
    throw new ChatInputError("Enter a prompt or attach an image.");
  const text: string[] = [];
  const images: Extract<UIMessage["parts"][number], { type: "file" }>[] = [];
  let bytes = 0;
  for (const part of message.parts) {
    if (part.type === "text" && typeof part.text === "string") {
      text.push(part.text);
      continue;
    }
    if (part.type !== "file" || typeof part.url !== "string")
      throw new ChatInputError("Attach a PNG, JPEG, WebP or GIF image.");
    const data =
      /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
        part.url,
      );
    if (!data || data[1] !== part.mediaType)
      throw new ChatInputError("Attach a PNG, JPEG, WebP or GIF image.");
    bytes += Math.floor((data[2].length * 3) / 4);
    if (bytes > IMAGE_BYTES)
      throw new ChatInputError("Keep attached images under 2 MB in total.");
    images.push(part);
    if (images.length > 3)
      throw new ChatInputError("Attach up to three images per message.");
  }
  const prompt = text.join("\n");
  if (prompt.length > DEMO_PROMPT_LIMIT)
    throw new ChatInputError(
      "Please keep your prompt under 32,000 characters. Attached images do not count toward this limit.",
    );
  if (!prompt.trim() && !images.length)
    throw new ChatInputError("Enter a prompt or attach an image.");
  if (images.length && !supportsImages(choice))
    throw new ChatInputError(
      "Choose an available image-capable model. Cohere supports text only. Auto can use images once it switches to GLM.",
    );
  return {
    prompt: prompt.trim()
      ? prompt
      : "Use the attached image as a visual reference for this project.",
    images,
  };
}

/** Text screening/redaction must not modify or log encoded image bytes. */
export function withoutImageData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutImageData);
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    if (
      item.type === "file" &&
      typeof item.mediaType === "string" &&
      item.mediaType.startsWith("image/")
    )
      return { type: "text", text: "[Attached reference image]" };
    return Object.fromEntries(
      Object.entries(item).map(([key, item]) => [key, withoutImageData(item)]),
    );
  }
  return value;
}
