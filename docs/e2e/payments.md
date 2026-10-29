# Payment and funded-prompt verification

## Every pull request

`npm run test:database` creates a disposable PostgreSQL fixture, discovers all `// @suite database` tests, and removes the fixture afterward. `tests/checkout.test.ts` exercises the application's actual checkout, webhook and payment-status route handlers and real wallet transactions. Stripe responses and model usage are fixtures; this is not a real Stripe payment or model run.

The integration checks cover an unfunded wallet rejecting usage, checkout parameters, retries sharing a Stripe idempotency key, a distinct purchase receiving a new key, signed duplicate webhook deliveries granting one S$10 credit, return-page reconciliation, and funded usage charging once and releasing its hold. Failures cover invalid/expired links, cross-origin requests, malformed bodies, Stripe transport/HTTP/JSON errors and unsafe redirect URLs. Existing payment tests cover ownership, unpaid sessions, wrong amount/currency/mode, rollback and webhook/return races.

`npm run test:payments-ui` runs real payment components against fixture APIs. It verifies pending/error/success states, cross-tab balances, retry availability and checkout attempt IDs. `npm run test:preview-browser` verifies the protected iframe and a hydrated Next.js counter. Both browser suites run in CI.

On a Mac unable to allocate PostgreSQL shared memory, explicitly choose an existing **local** server:

```bash
TEST_PG_ADMIN_URL=postgresql://YOUR_LOCAL_USER@127.0.0.1/postgres npm run test:database
```

This requires existing `anon` and `authenticated` roles and database-creation privileges. The harness creates and later drops a randomly named `dreamforge_test_…` database. It never migrates the database named in the admin URL. The default CI path still starts a private cluster.

## Real sandbox checkout and prompt journey

Stripe [documents that its hosted frontend has automation protections](https://docs.stripe.com/automated-testing). CI uses Stripe fixtures as recommended. The real sandbox runner automates DreamForge assertions and cleanup, with a person completing only the Stripe-hosted card form.

Create an ignored `.env.e2e.payments.local` with settings for the **same sandbox deployment, Supabase project and Stripe sandbox**:

```dotenv
E2E_BASE_URL=https://YOUR_SANDBOX_DEPLOYMENT
E2E_BROWSER_EXECUTABLE=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
E2E_PAYMENT_DATABASE_URL=postgresql://YOUR_SANDBOX_DATABASE
E2E_PAYMENT_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
E2E_PAYMENT_SUPABASE_ADMIN_KEY=YOUR_SANDBOX_ADMIN_KEY
E2E_PAYMENT_STRIPE_SECRET_KEY=sk_test_YOUR_SANDBOX_KEY
E2E_MODEL=glm
```

The deployment must have the credit wallet available and sandbox payments enabled, its own Stripe test key, the correct `DREAMFORGE_SITE_URL`, and a sandbox webhook delivering to `/api/platform/stripe`. Database TLS uses this repository's verified Supabase CA. The runner accepts no live Stripe key. Never put these settings in CI logs or source control.

Run:

```bash
npm run test:e2e:payments
```

The runner provisions a fresh marked test student with zero credit. It never resets an existing student's wallet. It runs the ordinary project journey with additional checks:

1. An unfunded prompt is refused and no credit is consumed or held.
2. The real top-up page opens Stripe. Before navigation, the runner independently retrieves the `cs_test_…` session with the test key and checks its mode, S$10 amount, account and package.
3. Complete the hosted form in the opened browser using `4242 4242 4242 4242`, any future expiry and CVC, within five minutes. Do not use a real card.
4. The runner blocks return-page reconciliation until it observes a payment receipt from the actual webhook. This prevents fallback reconciliation from disguising a broken webhook.
5. Reloads confirm the credit is delivered once. The ordinary live suite then generates code, interacts with the preview, verifies saved replies and checks that model work reduces that same prepaid balance.
6. The ordinary runner deletes the disposable project, runtime and snapshots in `finally`. The payment wrapper then verifies account identity and removes only that account’s sandbox receipts and payment links, then deletes the disposable auth user and verifies that its profile is gone.

The command exits nonzero on failure. `.e2e-results/payments/` contains `latest.json`, `payment-run.json` and screenshots. These results distinguish manual hosted-card entry from automated assertions. If project cleanup fails, it intentionally retains the owning account and `account.json` for recovery. Resolve the project through the existing E2E cleanup route before deleting the marked auth user. A killed process can also leave this recovery file; the next payment run refuses to overwrite it. Stripe sandbox records remain in Stripe for audit; no real money is charged.

A green fixture suite does not claim this real sandbox journey passed. Run it after changing payment configuration or webhook delivery, and retain its report.

## Verification on 29 October 2026

The deterministic checkout/accounting tests and payment UI checks passed. The real sandbox command was attempted, but Supabase rejected the configured admin credential with HTTP 401 before provisioning an account. No payment, test account, project or wallet mutation occurred. Supply a valid sandbox admin key in the private configuration before rerunning; hosted card entry remains a manual step. This live path is not verified yet.
