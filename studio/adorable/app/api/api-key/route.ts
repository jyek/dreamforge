export async function GET() { return Response.json({ hasGlobalKey: true, hasUserKey: false, provider: "openai" }); }
export async function POST() { return Response.json({ error: "Model credentials are managed by the school." }, { status: 403 }); }
