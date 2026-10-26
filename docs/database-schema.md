# DreamForge database

DreamForge uses one private application schema, `dreamforge`. Accounts are in
`profiles` (`role='child'` or `role='teacher'`); classroom membership is in
`class_members`; projects, conversations, usage, moderation and execution evidence
live alongside them. The four existing curriculum records move into
`dreamforge.courses`. Supabase's Auth, Storage, Realtime, Vault and extension
schemas remain managed by their respective services.

The retired `public` classroom implementation had no enrolled students, projects,
messages or budget records at audit time. Its signup/gating routes and duplicate
wallet/safety code are removed. The current teacher classes, roster, sharing,
student accounts and account-funded token balances remain the supported model.
A protected workspace without account login configured fails closed; an explicitly
configured adult demo remains available with its existing safety rules.

## Fresh database

Apply the two SQL files in `supabase/migrations` in filename order. The baseline
creates the current application schema; the consolidation migration is safe on a
fresh installation too. Configure the server environment variables from
`.env.example`, including `DREAMFORGE_AUTH_ENABLED=true`, before student use.
The originals in `supabase/history` are historical records, not a fresh-install
migration chain. Do not replay the old student-harness migration or one-shot
migration scripts on a consolidated database.

The application connects with `search_path=dreamforge,adorable,extensions`.
`adorable` is a temporary fallback so a deployment can be tested before the live
rename. `public` is deliberately excluded to prevent accidentally selecting a
legacy table with the same name. Queries do not add connections or schema probes
per request. Runtime filesystem paths such as `/adorable` are unrelated to the
Postgres namespace and remain unchanged to preserve saved environments.

## Existing production rollout

1. Merge and deploy the schema-compatible application first. Its HTML contains
   `data-database-schema="dreamforge"`. Test the deployment while the old schema
   still exists. Do not run the cutover while older application deployments are
   still serving production traffic.
2. Configure the target `DATABASE_URL` privately in `.env`. Install a PostgreSQL
   client at least as new as the server. Run the read-only audit:

   ```bash
   npx tsx scripts/consolidate-database.mts
   ```

3. Once deployment is verified, run:

   ```bash
   PG_DUMP=/path/to/pg_dump npx tsx scripts/consolidate-database.mts \
     --apply --site https://dreamforge2.vercel.app
   ```

   The script refuses an incompatible deployed app, creates and validates a
   private custom-format backup outside Git at
   `~/Documents/DreamForge/database-backups/<timestamp>/`, and writes before/after
   table counts and a backup checksum. It then applies the transaction and checks
   that every existing application table and the course table retain their OIDs.
   It never prints connection credentials or record contents.

4. Verify login, student/teacher roster and class access, balances, create/load,
   actual code edits, preview interactions and maintenance. Run the maintained
   live E2E journey; its disposable project is deleted in `finally`.

The cutover locks the execution-state table and refuses active or unrecovered
runs. It locks and checks each explicitly listed retired table, refusing any that
contains even one row. It uses `RESTRICT`, not cascading deletion; unexpected
external dependencies roll back the transaction. It preserves course rows, live
account/project identities, constraints, indexes and permissions. It repairs the
roster trigger body, renames the maintenance Vault entry through its API, and
recreates the pg_cron job through its API with the original schedule, database,
role and active state. Run the cutover as the existing maintenance-job owner;
Supabase rejects an explicit cron username for non-superusers, so the migration
checks ownership and uses the API default without changing roles. An existing
maintenance-secret name collision also aborts.
Supabase-managed service schemas are not renamed or removed.

## Recovery

A failed cutover transaction rolls back; keep the app on the compatible build and
inspect the stated guard. Do not empty a populated legacy table just to make the
migration pass. Migrate its data and dependencies deliberately first.

After a successful cutover, the compatible application can stay online while an
issue is investigated. Do not roll back to an old build that hard-codes
`adorable`. For full restoration, restore the saved application archive into an isolated recovery copy that
already contains the original Auth data, using a matching `pg_restore`. The
archive covers application schemas, not Supabase Auth or Storage. Verify its
contents and permissions, restore the maintenance configuration from the private
manifest, and arrange a controlled connection switch. Never overwrite a live
database with a backup while new student activity is being recorded.

## Tests

`npm run test:database` builds a temporary Postgres cluster from the fresh baseline
and runs the account quota, safety and execution suites. Separate disposable
migration databases replay the historical current-app schema, seed accounts,
projects, balances and courses, then exercise the live rename. They verify the
same connection works across cutover, data/table identities and permissions
survive, the roster trigger still works, populated tables and unexpected
dependencies roll back, active runs block migration, and cron/Vault references
are updated. A native pg_dump/pg_restore regression also restores an isolated application
archive with matching Auth IDs and checks data and private permissions. No
production data is used in these fixtures.
