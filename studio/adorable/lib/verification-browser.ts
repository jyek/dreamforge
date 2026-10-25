export async function connectVerificationBrowser(endpoint: string) {
  const { chromium } = await import("playwright-core");
  if (endpoint !== "builtin")
    return chromium.connectOverCDP(endpoint, { timeout: 10000 });
  const { default: binary } = await import("@sparticuz/chromium");
  return chromium.launch({
    executablePath: await binary.executablePath(),
    args: binary.args,
    headless: true,
    timeout: 15000,
  });
}
