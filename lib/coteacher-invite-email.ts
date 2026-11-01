const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
/** Deliberately simple check; the provider does the real validation. */
export const validEmail = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= 254 &&
  /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(value);
/** Contains only the inviter's display name, class name and the private link. */
export function coTeacherInviteEmail(input: {
  inviterName: string;
  className: string;
  link: string;
}) {
  const { inviterName, className, link } = input;
  return {
    subject: `${inviterName} invited you to co-teach ${className} on DreamForge`,
    text: `${inviterName} invited you to co-teach "${className}" on DreamForge.\n\nOpen this private link while signed in to a teacher account to join. It works once and expires in seven days:\n${link}\n\nIf you weren't expecting this, you can ignore this email.`,
    html: `<p>${escapeHtml(inviterName)} invited you to co-teach <strong>${escapeHtml(className)}</strong> on DreamForge.</p><p><a href="${escapeHtml(link)}">Accept the invitation</a></p><p>Open the link while signed in to a teacher account. It works once and expires in seven days.</p><p>If you weren't expecting this, you can ignore this email.</p>`,
  };
}
