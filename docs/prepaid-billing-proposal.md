# Proposal: one prepaid balance

Status: for review only. Do not merge, migrate production, enable the feature
flag, convert balances, or change live checkout packages until approved.

## Decision and customer experience

Use one SGD prepaid credit balance. Basic and Advanced describe models, not
separate currencies. Parents buy S$10, S$25, S$50 or S$100 of credit. Students switch
models freely, see their model's category and published prices in the selector,
and spend the same balance. There is no Advanced token purchase or conversion
between wallets. Amounts represent DreamForge service credit, not cash deposits.

The profile and sidebar show available credit. The profile shows confirmed
spending, temporary holds and actual charges by project, including safety checks.
The payment return page confirms both the amount credited and the new balance.
Previous token receipts remain valid and cannot credit twice. No subscription,
automatic renewal or automatic model upgrade is introduced.

The seven choices are Claude Haiku 5.5 (default), Claude Sonnet 5.5, GPT-6
Luna, GPT-6.1 Sol, Gemini 3.5 Flash-Lite, Gemini 3.8 Flash and GLM 5.3 Flash.
Each vendor has a low-cost and mid-tier option, with GLM Flash retained for
explicit testing. Auto, Cohere North Mini Code, DeepSeek and full GLM are not
selectable. All seven accept image references. Existing model selections remain
saved when valid; retired choices fall back to Claude Haiku.

## Cost rate and 50% markup

Customer rate = declared provider cost in USD × USD-to-SGD conversion × 1.50.
The cost rate and selling rate are separate fields/functions in the rate card;
prices are derived by this formula rather than independently entered retail
numbers. Top-ups add exactly their SGD face value, with no top-up markup. The
minimum new prepaid checkout is S$10 and the available amounts are S$10, S$25,
S$50 and S$100. Legacy token packages remain only for pre-cutover compatibility.

`sgd-2026-10-cost-plus-50-v1` fixes the planning conversion at 1 USD = S$1.35.
This is an explicit proposal assumption, not a live FX quote. Update the version
and review all prices when changing cost rates or FX; preserve existing versions
for reserved/pending runs. No daily automatic FX/cost-rate updates are implemented.

The provider costs below are the OpenRouter catalog snapshot checked on
28 October 2026, in USD per one million input/output tokens. These can differ
from vendor list prices and may include temporary provider discounts. Routing
caps for selectable models are aligned with the declared costs; if an eligible private
provider cannot meet them, the request fails instead of silently buying at a
higher price. Verify provider availability on staging before activation.

| Model | Category | USD input cost | USD output cost | SGD input price | SGD output price |
| --- | --- | ---: | ---: | ---: | ---: |
| Claude Haiku 5.5, up to 100K input | Basic, default | $0.10 | $0.50 | S$0.2025 | S$1.0125 |
| Claude Haiku 5.5, above 100K input | Basic | $0.50 | $2.50 | S$1.0125 | S$5.0625 |
| Claude Sonnet 5.5 | Advanced | $2 | $10 | S$4.05 | S$20.25 |
| GPT-6 Luna, up to 272K input | Basic | $0.10 | $0.50 | S$0.2025 | S$1.0125 |
| GPT-6 Luna, above 272K input | Basic | $0.20 | $0.75 | S$0.405 | S$1.51875 |
| GPT-6.1 Sol, up to 272K input | Advanced | $2 | $10 | S$4.05 | S$20.25 |
| GPT-6.1 Sol, above 272K input | Advanced | $4 | $15 | S$8.10 | S$30.375 |
| Gemini 3.5 Flash-Lite | Basic | $0.30 | $2.50 | S$0.6075 | S$5.0625 |
| Gemini 3.8 Flash | Advanced | $0.825 | $4.125 | S$1.670625 | S$8.353125 |
| GLM 5.3 Flash | Basic, testing | $0.15 | $0.50 | S$0.30375 | S$1.0125 |
| Safety classifier | Workflow calls | $0.075 | $0.30 | S$0.151875 | S$0.6075 |

The menu shows literal per-token input and output prices, including all existing
Basic models, not just the Advanced choices. For example, GLM Flash input is
S$0.00000030375/token and output is S$0.0000010125/token. The tooltip also provides
rates per million for easier comparison, and discloses Haiku/Luna/Sol long-context rates.
While the feature is disabled, prices are labelled proposed rather than implying
that current production token purchases already use them.

Usage is priced at the versioned rate, converted with the same FX and marked up
50%. Reported cached reads and default five-minute cache writes use their own
provider cost rates and the same markup; they are not billed at ordinary input
rates. If cache usage is not reported, standard input pricing applies. An
unpriced cache type or invalid token report leaves a reviewable hold. One-hour
cache writes are not requested by the current adapter. The ledger retains cache
counts and the rate-card version. Retail charges use integer rational arithmetic,
rounded once per model step up to the nearest micro-SGD, not once per token.
Reasoning tokens are included in reported output totals. Repeated tool steps,
context and safety checks also consume usage. Historical free model rates remain in the versioned ledger but are not selectable. No per-message fee is added.

The profile shows all-time token counts and input/output counts alongside actual
prepaid spending, available SGD and temporary holds. Its project table shows
both tokens used and SGD spent, without substituting one for the other.

A 50% cost markup yields a 33.3% gross margin before payment fees, FX differences,
provider funding fees, tax, refunds, support and infrastructure. For instance,
US$1 of declared model cost becomes S$1.35 cost and S$2.025 customer charges at
the planning FX. VM uptime/storage and browser verification have costs even when
few model tokens are used, so this rule does not guarantee an overall profit.
This is pricing against a declared rate snapshot, not a claim to reproduce every
line of the eventual provider invoice or promotional credit.

Sources:

- [OpenRouter model cost catalog](https://openrouter.ai/api/v1/models)
- [OpenAI GPT-6.1 Sol pricing and long-context surcharge](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
- [Anthropic Sonnet 5.5 specifications and pricing](https://platform.claude.com/docs/en/models/sonnet-5-5/overview)
- [Z.ai vendor list pricing, which can differ from gateway costs](https://docs.z.ai/guides/overview/pricing)
- [OpenRouter stateless Responses API](https://openrouter.ai/docs/api/reference/responses/overview)

## Existing balances and rollout

Proposed goodwill conversion: each unspent old token becomes five micro-SGD,
equivalent to the old S$5 / 1M package. This uses the highest old package price per
token so discounted buyers gain value rather than losing it. For example, 1M
remaining tokens becomes S$5 and 6M becomes S$30, even if those 6M originally cost
S$20. Approve this conversion explicitly before production rollout; it is a
one-time promotional expense. Previous receipts and counters are preserved, and
historical spending is not billed a second time. New child accounts receive S$0.50
starter credit, matching the conversion of their old 100K starter allowance.

The migration refuses any active project execution or reserved/uncertain usage. It locks the wallets and usage
ledger, adds integer micro-SGD balance/charge fields and converts only remaining
allowance. It does not touch Supabase-managed schemas. Back up first and verify
account-by-account conversion totals against a dry-run audit before applying.
Drain active runs and resolve holds through the supported review/recovery flow;
do not discard unknown usage simply to force the migration to pass.

Deploy the compatible application with `DREAMFORGE_PREPAID_BILLING_ENABLED=false`.
The PR preview and its live Basic journey can use the existing database without
activating proposed billing. Review the rate card and conversion, test on a
separate database, block new generation and checkout traffic throughout the cutover window, apply the migration, then enable the
flag. Old token-package checkouts that finish after conversion receive their
promised tokens' conversion value. The unique Stripe session ID prevents old
receipts from being applied twice. New checkouts then sell monetary credit only.

Do not turn the flag back off or roll back to a token-only build after credit
spending starts: that would expose the old allowance again. Revert through a
compatible build while preserving the monetary ledger. Future changes should
separate the schema readiness switch from feature availability if independent
model disabling is needed.

## Verification and follow-ups

Local fixtures test atomic reservations, different model deductions from the same
balance, duplicate payment delivery, confirmed checkout balance, live UI refresh,
unknown/over-bound usage retaining its hold, pricing versions and provider-specific
routing. Advanced requests use mocked provider responses; no production Advanced
model spend or real payment is required for this proposal.

Before activation, run sandbox card checkout and real Advanced edit/tool journeys
on the separate staging database, verify each provider's actual token reporting,
and reconcile the retail ledger against provider invoices. Sonnet rejects forced
tool choice, so its adapter uses auto selection while the harness still rejects
unsupported claims of completed edits. Sol uses the Responses API with stateless
storage disabled. These paths need live staging coverage before enabling them for
students.

A parent-controlled Advanced spending cap and a per-request cost estimate/limit
would further improve confidence. They are follow-ups, not implemented in this PR.
The present PR publishes per-token model rates and shows token usage and actual spending by project; it does
not claim to know the final price of a multi-step coding request in advance.

## Local development

The actual app runs from this checkout at http://localhost:3000. It uses private,
Git-ignored .env.local settings. By explicit user choice, the current local
instance connects to production Supabase so existing projects appear; editing
those projects therefore affects the real VMs and records. No production
migration has been applied, and prepaid billing/Stripe checkout remain disabled
for this production-connected local run until the new wallet schema is approved.

A separate development database can be used with NODE_ENV=development,
DREAMFORGE_LOCAL_DATABASE=true and a loopback DATABASE_URL; only that combination
permits non-TLS local PostgreSQL. Production and remote databases keep verified
TLS. Development Stripe sessions use local_child_id/local_origin metadata, never
production child_id; production webhook handlers ignore those sessions.
