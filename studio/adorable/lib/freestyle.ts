import { Freestyle } from "freestyle";
import { setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
setDefaultAutoSelectFamilyAttemptTimeout(5000);

/**
 * The Freestyle client. VMs are the only primitive Adorable uses: there is no
 * hosted git and no serverless deployment, so a project *is* its VMs.
 */
let client: Freestyle | undefined;
// The isolated Vercel pilot does not need or receive Freestyle credentials.
export const freestyle = new Proxy({} as Freestyle, {
  get(_target, property) {
    client ??= new Freestyle({
      apiKey: process.env.FREESTYLE_API_KEY,
      baseUrl: process.env.FREESTYLE_BASE_URL,
    });
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
