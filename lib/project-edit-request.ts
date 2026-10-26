import type { UIMessage } from "ai";

/** Conservative routing hint for explicit edit requests, never an authorization check.
 * Questions and requests for plans/examples must remain able to answer without tools.
 */
export function requestsProjectEdit(messages: UIMessage[]): boolean {
  const turns = messages.filter((m) => m.role === "user");
  let text = "";
  while (turns.length) {
    text = (turns.pop()!.parts || [])
      .filter((p) => p.type === "text")
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("\n")
      .trim();
    if (!/^(?:please\s+)?(?:continue|try again|keep going)[.!\s]*$/i.test(text))
      break;
  }
  if (
    /\b(?:don't|do not|without|no)\s+(?:use\s+(?:any\s+)?tools|(?:edit(?:ing)?|chang(?:e|ing)|modif(?:y|ying))(?:\s+(?:any|the|project|source))*\s+(?:files|code))\b/i.test(
      text,
    )
  )
    return false;
  const request = text.replace(
    /^(?:please\s+|(?:can|could|would|will) you\s+|i (?:want|need)(?: you)? to\s+|help me\s+)+/i,
    "",
  );
  if (
    /^(?:explain|describe|why|what|how|tell me|show me|suggest|plan|review|compare|reply|say|summarize)\b/i.test(
      request,
    )
  )
    return false;
  if (
    /^(?:make|create|build|write|add|change|update)\s+(?:me\s+)?(?:a\s+|an\s+|the\s+)?(?:plan|prompt|explanation|summary|list of ideas|example answer)\b/i.test(
      request,
    )
  )
    return false;
  return /^(?:make|build|create|implement|fix|change|update|edit|modify|add|remove|delete|replace|rename|resize|increase|decrease|move|align|style|redesign|restore|revert)\b/i.test(
    request,
  );
}

export const PROJECT_EDIT_TOOLS = new Set([
  "writeFileTool",
  "replaceInFileTool",
  "appendToFileTool",
  "movePathTool",
  "deletePathTool",
  "makeDirectoryTool",
]);

export function successfulProjectEdit(name: string, output: unknown): boolean {
  if (!PROJECT_EDIT_TOOLS.has(name) || !output || typeof output !== "object")
    return false;
  const result = output as {
    ok?: boolean;
    changed?: boolean;
    replacements?: number;
  };
  return (
    result.ok === true && result.changed !== false && result.replacements !== 0
  );
}
