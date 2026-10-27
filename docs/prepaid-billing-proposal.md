# Proposal: one prepaid balance

Status: for review only. Do not merge, migrate production, enable the feature
flag, convert balances, or change live checkout packages until approved.

## Decision and customer experience

Use one SGD prepaid credit balance. Basic and Advanced describe models, not
separate currencies. Parents buy S$5, S$10, S$20 or S$40 of credit. Students switch
models freely, see their model's category and published prices in the selector,
and spend the same balance. There is no Advanced token purchase or conversion
between wallets. Amounts represent DreamForge service credit, not cash deposits.

The profile and sidebar show available credit. The profile shows confirmed
spending, temporary holds and actual charges by project, including safety checks.
The payment return page confirms both the amount credited and the new balance.
Previous token receipts remain valid and cannot credit twice. No subscription,
automatic renewal or automatic model upgrade is introduced.

Basic: Auto, Cohere North Mini Code, GLM 5.3 Flash, DeepSeek V4.1 Flash.
Advanced: Claude Sonnet 5.5, GPT-6.1 Sol, GLM 5.3 [1M]. Auto stays Basic.
The [1M] label means model context capacity, not one million purchased tokens.
GLM 5.3 accepts text only; the other two Advanced choices support image input.

## Proposed retail rates

Prices are SGD per one million actual input/output tokens. They are retail
service rates, distinct from underlying USD provider bills. Cached input and
reasoning are counted in reported total input/output tokens at these retail
rates; the proposal does not promise provider cache discounts. Tokens from
repeated tool/model steps all count. No additional per-message fee is proposed.

| Model | Category | Input | Output |
| --- | --- | ---: | ---: |
| Cohere North Mini Code | Basic | S$0.25 | S$1.00 |
| GLM 5.3 Flash | Basic | S$0.75 | S$2.50 |
| DeepSeek V4.1 Flash | Basic | S$1.50 | S$6.00 |
| Claude Sonnet 5.5 | Advanced | S$10.00 | S$50.00 |
| GPT-6.1 Sol, up to 272K input | Advanced | S$10.00 | S$50.00 |
| GPT-6.1 Sol, above 272K input (whole request) | Advanced | S$20.00 | S$75.00 |
| GLM 5.3 [1M] | Advanced | S$7.00 | S$22.00 |
| Safety classifier (separate model calls) | Included workflow | S$0.375 | S$1.50 |

For one call using 20,000 input and 2,000 output tokens, the proposed charge is
S$0.02 for GLM Flash, S$0.042 for DeepSeek, S$0.184 for GLM 5.3, or S$0.30 for
Sonnet/Sol. These are illustrations, not quotes for an entire coding request:
multiple tool steps, accumulated context and safety calls add usage.

The rate card is versioned as `sgd-2026-10-v1`. Usage records retain the version;
future price changes must preserve old versions for reserved/pending runs. No
unpriced model can silently consume credit. Provider routing also has explicit
maximum supplier prices, so unexpected premium endpoints fail rather than
silently changing the economics.

## Cost and margin assumptions

Checked 28 October 2026. Sonnet list pricing is US$2 input / US$10 output per
million; Sol is US$2 / US$10 normally and US$4 / US$15 above 272K input. GLM 5.3
list pricing is US$1.40 / US$4.40; GLM Flash is US$0.15 / US$0.50. OpenRouter's
catalog currently lists a lower GLM price, but the proposal does not depend on a
promotion continuing. Supplier caps use list prices and Sol long-context rates.

Use US$1 = S$1.35 as a planning assumption, not a live exchange-rate quote. At a
90% input / 10% output mix, one million Sonnet tokens costs about S$3.78 before
fees and infrastructure and sells for S$14.00, roughly 73% gross margin before
those costs. Basic GLM Flash costs about S$0.25 and sells for S$0.925, also about
73%. This is a starting rate card to test against real usage, not a profitability
guarantee. Actual FX, OpenRouter funding fees, Stripe fees, tax, refunds, moderation,
verification, support and VM storage/uptime must be included in the operating model.
A long-running idle VM can cost money without generating token revenue; monitor
that separately rather than assuming token markup covers every account.

Charging for Cohere, despite a free upstream endpoint, pays for the overall
DreamForge workflow; it is labelled Basic, never advertised as free usage.

Sources:

- [OpenAI GPT-6.1 Sol pricing and long-context surcharge](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
- [Anthropic Sonnet 5.5 specifications and pricing](https://platform.claude.com/docs/en/models/sonnet-5-5/overview)
- [Z.ai list pricing](https://docs.z.ai/guides/overview/pricing)
- [Live OpenRouter model catalog](https://openrouter.ai/api/v1/models)
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
The present PR publishes model rates and shows actual spending by project; it does
not claim to know the final price of a multi-step coding request in advance.
