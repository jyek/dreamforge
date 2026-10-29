import { database } from "./database";
/** This public permission applies only to app pages and assets, never project/chat APIs. */
export async function isPubliclyShowcased(projectId: string) {
  if (!/^vm-[a-z0-9]+$/.test(projectId)) return false;
  return !!(
    await database().query(
      "select 1 from projects where vm_id=$1 and is_showcased",
      [projectId],
    )
  ).rowCount;
}
