/** Local billing must never be selected on a production server or remote DB. */
export function localDevelopmentBilling() {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.DREAMFORGE_LOCAL_DATABASE !== "true"
  )
    return false;
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    );
  } catch {
    return false;
  }
}
