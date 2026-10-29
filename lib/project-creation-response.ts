export async function projectCreationResult(
  response: Response,
): Promise<{ id: string; conversationId: string }> {
  const text = await response.text();
  let result: { error?: unknown; id?: unknown; conversationId?: unknown };
  try {
    result = JSON.parse(text);
  } catch {
    throw Error(
      "Project creation did not return a complete response. Refresh your projects before trying again.",
    );
  }
  if (!result || !response.ok)
    throw Error(
      typeof result?.error === "string"
        ? result.error
        : "We couldn’t create your project. Please try again.",
    );
  if (
    typeof result.id !== "string" ||
    !/^vm-[a-z0-9]+$/.test(result.id) ||
    typeof result.conversationId !== "string" ||
    !/^[a-f0-9-]{36}$/i.test(result.conversationId)
  )
    throw Error(
      "Project creation returned an incomplete result. Refresh your projects before trying again.",
    );
  return { id: result.id, conversationId: result.conversationId };
}
export function projectCreationFailure(error: unknown) {
  const code = (error as { code?: string })?.code || "";
  if (code === "hosting_starter_not_configured")
    return {
      status: 503,
      error:
        "New project workspaces are temporarily unavailable. Please contact DreamForge support.",
    };
  const limit =
    (error as { details?: { limit?: string } })?.details?.limit || "";
  if (code === "no_credit_kept_limit")
    return {
      status: 503,
      error:
        "Project hosting has reached its workspace limit. The DreamForge account owner needs to add Runtime credit or remove unused workspaces before another project can be created.",
    };
  if (code === "no_capacity")
    return {
      status: 503,
      error:
        "Project hosting has no space for a new workspace right now. Please try again later.",
    };
  if (code === "quota_exceeded" && /stored|storage/.test(limit))
    return {
      status: 503,
      error:
        "Project storage is currently full. Please contact DreamForge support to free space, then try again.",
    };
  if (
    /quota|no_credit|included_usage|no_capacity|spending_limit|credit/i.test(
      code,
    )
  )
    return {
      status: 503,
      error:
        "Project hosting is currently at capacity. Please try again later.",
    };
  return {
    status: 503,
    error:
      "We couldn’t create your project. Please try again. If this continues, contact DreamForge support.",
  };
}
