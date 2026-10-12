import { safetyEnabled } from "@/lib/safety-mode";
import { NextResponse } from "next/server";
import { authorizeProject } from "@/lib/project-access";
import { setProductionDomain } from "@/lib/project-storage";
import { remapDomain } from "@/lib/project-vm";
import { DOMAIN_SUFFIX } from "@/lib/vars";

const normalizeDomain = (domain: string) =>
  domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0] ?? "";

/**
 * Only subdomains of the account's verified domain are accepted: those already
 * have DNS and an ACME delegation, so setting one always works. Any other
 * domain has to be verified on the account first, which is a separate flow.
 */
const isPreviewDomain = (domain: string) =>
  new RegExp(
    `^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.${DOMAIN_SUFFIX.replaceAll(".", "\\.")}$`,
  ).test(domain);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  if (safetyEnabled()) return NextResponse.json({error: "Publishing is unavailable while safety checks are enabled."},{status:403});
  const metadata = await authorizeProject(projectId);
  if (!metadata) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if(metadata.staticProductionUrl)return NextResponse.json({error:"Static projects use their published game link. Custom VM domains apply to server projects."},{status:400});
  const payload = (await req.json().catch(() => ({}))) as { domain?: string };
  const domain = normalizeDomain(payload.domain ?? "");

  if (!isPreviewDomain(domain)) {
    return NextResponse.json(
      { error: `Domain must be a single label ending in .${DOMAIN_SUFFIX}` },
      { status: 400 },
    );
  }

  // Before the first publish there is no production VM yet, so the name is
  // just recorded — the publish that creates the VM maps it.
  if (metadata.prodVmId) await remapDomain(domain, metadata.prodVmId);
  const next = await setProductionDomain(projectId, domain);

  return NextResponse.json({
    productionDomain: next.productionDomain,
    productionUrl: `https://${next.productionDomain}`,
  });
}
