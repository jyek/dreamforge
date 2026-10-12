# Static game hosting

Worker source for the existing `dreamforge-games.jyek.chatgpt.site` host. It serves immutable game releases from an R2 `BUCKET` binding. Private uploads and release activation require the runtime secret `PUBLISH_TOKEN`; no secret is included here.

The studio exports compatible games and calls this host through its server-side `STATIC_PUBLISH_URL` and `STATIC_PUBLISH_TOKEN` settings. Build using `bash scripts/build.sh`, then validate with `node scripts/validate-artifact.mjs`. The `.openai/hosting.json` preserves the existing Sites project identity. Deploy through the Sites hosting workflow; this is not part of the Next.js Vercel deployment.
