# DreamForge

DreamForge runs its Next.js site and API on Vercel, project workspaces on Runtime, and accounts, project metadata and conversations on Supabase. Project URLs keep their original `vm-*` identifiers; `adorable.runtime_bindings` maps those identifiers to Runtime sandboxes.

New projects use a blank Next.js/shadcn foundation, with no sample layout. Existing projects and their source code are preserved. Runtime workspaces pause after five minutes of inactivity.

## Teacher and child accounts

Apply `supabase/migrations/202610140001_dreamforge_classrooms.sql` and `202610140002_uncertain_usage.sql` before enabling `DREAMFORGE_AUTH_ENABLED=true`. Configure server-only variables from `.env.example`, including `SUPABASE_SERVICE_ROLE_KEY` and the canonical `DREAMFORGE_SITE_URL`. Never expose the service key through a `NEXT_PUBLIC_*` variable.

The setup script reads a private `.deployment/production.env`, applies missing platform migrations, and can create a first teacher invitation:

```sh
npx tsx scripts/setup-platform.mts --invite
```

It stores the one-use token in `.deployment/initial-teacher-invite.json`. Use `/signup?teacherInvite=<token>` within seven days. Teachers can then create classes and copy class codes. They can invite other teachers, who receive access only to their own classes.

Children sign up with a class code and a username; an email is optional. Existing child accounts can join additional classes. Login accepts username or email. Supabase Admin creates confirmed accounts directly, so DreamForge does not send verification emails or change the Supabase project's global email-confirmation setting. Sessions currently expire after one hour; sign in again to continue.

Children edit only their own projects. Teachers can view all projects and prompt histories belonging to children in their classes, without editing. Existing demo projects are marked `is_example` and remain separate, read-only examples. Server authorization applies to APIs as well as the UI. Classroom tables live in the `adorable` schema and deny direct access by browser Supabase keys. The older public LMS tables are preserved and are not used by the new platform.

## Usage and parent top-ups

Each child starts with 100,000 total input/output tokens. Every model step reserves an allowance atomically, then settles actual provider-reported token counts. Prompts, history, source/tool context, and replies count, including free-model requests. The ledger records the actual model and a conservative USD estimate using the configured OpenRouter price caps; that estimate is not an invoice or exact provider billing.

If a request ends without confirmed usage, its allowance remains held rather than being reported as tokens used. The runtime cron identifies stale requests after 15 minutes. A teacher can review and release an unconfirmed hold; the release is recorded. Confirmed usage cannot be released through this endpoint.

Proposed pilot packages in `lib/topup-packages.ts`:

| SGD price | Total tokens |
| --- | --- |
| S$5 | 1,000,000 |
| S$10 | 2,500,000 |
| S$20 | 6,000,000 |

Review these prices before enabling real checkout. At OpenRouter's Qwen rate of US$0.07/M input and US$0.28/M output, a million tokens with a 75/25 split costs approximately US$0.1225 for the model. Runtime, Vercel, database, OpenRouter funding and payment fees are additional. Stripe Singapore advertises 3.4% + S$0.50 for domestic cards; tiny top-ups are inefficient. See [OpenRouter Qwen pricing](https://openrouter.ai/qwen/qwen3-coder-30b-a3b-instruct) and [Stripe Singapore pricing](https://stripe.com/en-sg/pricing).

A child generates a private seven-day `/pay/<token>` link to share with a parent. The page does not grant access to projects or conversations. Checkout uses fixed server-defined SGD packages, with no subscription. Tokens are credited only by signature-verified paid Stripe events, atomically and once per checkout session. The success URL does not credit tokens.

Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and register `/api/platform/stripe` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. `DREAMFORGE_PAYMENTS_ENABLED` stays false until prices, live-mode keys and fulfillment are verified. Test-mode keys must not be used to sell real token allowances.

## Prompt reviews and brand

The teacher dashboard shows paginated prompt history with a flagged-only filter, redacted personal identifiers, local safety decisions/categories, and review status. Marking a prompt reviewed does not override a blocked request. Current checks are local text rules and safe source-file tools; they do not classify images or provide comprehensive moderation. Existing external-moderation LMS routes remain separate.

The original vector logo is `public/brand/dreamforge-mark.svg`. New account, classroom and parent-payment pages use cream, purple, orange, yellow and lime with rounded cards and hard shadows. Project workspaces retain the familiar conversation/preview layout.

## Development

```sh
npm install
npm run dev
npm run build
node --import tsx --test tests/stripe-signature.test.ts
```

Keep real credentials, migration backups and test artifacts in ignored local files. Runtime trial retention is provider-controlled; a paid operating plan and source backups are needed before promising long-term classroom project retention.
