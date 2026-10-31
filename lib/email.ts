export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email sending is not configured.");
    this.name = "EmailNotConfiguredError";
  }
}
export const emailConfigured = () =>
  Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
/** Sends one transactional email through Resend. Never logs recipients or bodies. */
export async function sendEmail(
  message: { to: string; subject: string; html: string; text: string },
  request: typeof fetch = fetch,
) {
  if (!emailConfigured()) throw new EmailNotConfiguredError();
  const response = await request("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      ...message,
      to: [message.to],
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Error(`Email provider returned ${response.status}`);
}
