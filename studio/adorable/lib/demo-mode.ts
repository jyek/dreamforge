/** Server-only switch. Default to classroom mode unless explicitly disabled. */
export const demoMode = () => process.env.STUDENT_LOGIN_ENABLED === 'false';
