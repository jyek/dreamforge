import { redirect } from "next/navigation";
// Compatibility for old bookmarks; school administrators use the normal workspace.
export default function Page() {
  redirect("/home");
}
