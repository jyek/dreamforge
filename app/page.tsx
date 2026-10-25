import { Assistant } from "./assistant";
import { HomeWelcome } from "@/components/assistant-ui/home-welcome";

import { platformEnabled, getProfile } from "@/lib/platform-auth";
import { redirect } from "next/navigation";

export default async function Home() {
  if (platformEnabled()) redirect((await getProfile()) ? "/home" : "/login");
  return <Assistant welcome={<HomeWelcome />} />;
}
