import { demoMode } from './demo-mode';
/** Login controls identity and quotas; safety has its own server-only switch.
 * Classroom safety cannot be disabled by a demo setting. */
export const safetyEnabled = () => !demoMode() || process.env.SAFETY_ENABLED === 'true';
export const moderationConfigured = () => Boolean(process.env.STUDENT_MODERATION_URL && process.env.STUDENT_MODERATION_KEY);
