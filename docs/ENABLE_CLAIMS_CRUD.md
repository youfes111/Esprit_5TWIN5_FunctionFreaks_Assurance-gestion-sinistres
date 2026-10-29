# Enable authenticated Claims CRUD (Windows)

This guide activates the existing Phase 2 claims CRUD after the Fuseki writer has been configured privately. It does not create a second TDB2 database, change the ontology, or modify the running Fuseki instance. **No Fuseki, backend or frontend process was started and no RDF writes were made while preparing this guide.**

## Current state and safety gate

The existing CRUD routes, validation, revision checks, provenance guards, and session/RBAC middleware are implemented. The current local `backend/.env` has `CLAIMS_MUTATIONS_ENABLED=false` and no Fuseki update username or password. Therefore mutations remain disabled until you provision a writer account and deliberately configure the backend. `backend/src/config/env.ts` fails startup if the switch is enabled without credentials or with a query/update endpoint mismatch. There is no anonymous write fallback.

`ADMIN` and `AGENT` have the backend `claims:write` permission; `VIEWER` can read only. All `/api` claim routes require an authenticated session, writes pass the permission middleware and independent feature gate, and existing CSRF/Origin checks remain applied. The original `S2026_014` record and claims without application provenance remain protected. Never send Fuseki credentials to the browser.

## Prerequisites and existing data

- Windows PowerShell, Java compatible with the already installed Apache Jena Fuseki **6.2.0**, and the existing Fuseki runtime.
- The existing persistent database at `C:\Users\Dhib\tools\assurance-fuseki-runtime\data\assurance`.
- A planned maintenance window. Only one Fuseki process may open that TDB2 directory at a time.
- Keep the existing read-only configuration and the original `ontology/assurance.owl`. Do not re-import the OWL file and do not initialize a second/empty dataset.

The setup below intentionally targets the existing external runtime, not the ignored `.local/fuseki` development example. Confirm the actual current `FUSEKI_BASE` and process command in your environment before doing anything. If any path differs, stop and adjust the commands manually. Do not replace files in an active Fuseki base.

## 1. Back up the existing TDB2 store

Schedule downtime, stop Fuseki normally, and confirm the process has exited. Do not copy a live TDB2 directory and do not delete lock files. Then run:

```powershell
$fusekiBase = 'C:\Users\Dhib\tools\assurance-fuseki-runtime'
$datasetPath = Join-Path $fusekiBase 'data\assurance'
$backupRoot = 'C:\Users\Dhib\tools\assurance-fuseki-backups'
$backupPath = Join-Path $backupRoot (Get-Date -Format 'yyyyMMdd-HHmmss')
if (-not (Test-Path -LiteralPath $datasetPath)) { throw "Existing dataset not found: $datasetPath" }
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
if (Test-Path -LiteralPath $backupPath) { throw "Backup target already exists: $backupPath" }
Copy-Item -LiteralPath $datasetPath -Destination $backupPath -Recurse
if (-not (Test-Path -LiteralPath $backupPath)) { throw 'Backup copy did not complete.' }
Get-ChildItem -LiteralPath $backupPath -File -Recurse | Measure-Object -Property Length -Sum
```

Keep the backup outside the repository and protect it like the database. Record the file count/size and retain the directory until the write-enabled configuration has passed your manual acceptance. This is a filesystem copy made while Fuseki is stopped; use Jena's supported backup procedure instead if your operations policy requires it.

## 2. Prepare the private writer account and Fuseki profile

The repository's `config/fuseki/assurance-write.ttl` defines the same `assurance` dataset at relative path `data/assurance`, with only named `query` and `update` operations. `config/fuseki/shiro-write.ini` allows anonymous query, requires the dedicated `claims-writer` role for the update path, and denies Fuseki administration. The write profile must be paired with its Shiro file; do not pair it with the read-only `shiro.ini`.

Generate a fresh high-entropy password locally. Do not paste it in chat, source control, or documentation:

```powershell
$bytes = New-Object byte[] 32
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$random.GetBytes($bytes)
$random.Dispose()
$writerPassword = [Convert]::ToBase64String($bytes)
Remove-Variable bytes
Remove-Variable random
```

Stop the existing Fuseki process first. Preserve the current base and data directories. Back up its configuration files, then copy the profile files over the *existing* base configuration names. Review paths before executing:

```powershell
$projectRoot = 'C:\Users\Dhib\Documents\GitHub\Esprit_5TWIN5_FunctionFreaks_Assurance-gestion-sinistres'
$fusekiBase = 'C:\Users\Dhib\tools\assurance-fuseki-runtime'
$configBackup = Join-Path $fusekiBase ('config-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $configBackup | Out-Null
Copy-Item -LiteralPath (Join-Path $fusekiBase 'shiro.ini') -Destination $configBackup
# Back up any existing assembler/config file you use before changing it.
Copy-Item -LiteralPath (Join-Path $projectRoot 'config\fuseki\shiro-write.ini') -Destination (Join-Path $fusekiBase 'shiro.ini')
Copy-Item -LiteralPath (Join-Path $projectRoot 'config\fuseki\assurance-write.ttl') -Destination (Join-Path $fusekiBase 'assurance-write.ttl')
```

Edit **only the private** `$fusekiBase\shiro.ini` copy and replace `REPLACE_BEFORE_STARTING` with `$writerPassword`. Do not save or commit the generated password in the repository. Store it in a password manager; when entering it into `backend/.env`, protect that file with Windows account permissions. The provided Shiro INI stores the local credential in the Fuseki base configuration; protect that directory accordingly.

The writer account has only the `claims-writer` role, not an admin role. The service assembler exposes no upload or Graph Store write operation. Keep Fuseki loopback-bound with `--localhost`; do not expose port 3030 through a firewall, reverse proxy, or frontend proxy. Basic authentication is appropriate here only over loopback. For remote deployment, use a TLS-terminating trusted proxy and a separately reviewed production security configuration.

## 3. Configure the backend only after Fuseki is ready

Merge these backend-only settings in `backend/.env`, preserving every unrelated setting. Replace the placeholders locally; do not use `VITE_*` variables:

```dotenv
CLAIMS_MUTATIONS_ENABLED=true
FUSEKI_QUERY_ENDPOINT=http://127.0.0.1:3030/assurance/query
FUSEKI_UPDATE_ENDPOINT=http://127.0.0.1:3030/assurance/update
FUSEKI_UPDATE_USERNAME=claims-writer
FUSEKI_UPDATE_PASSWORD=<the private generated writer password>
```

The backend validates that the update endpoint matches the query origin and dataset, and refuses enabled write mode when credentials are missing or malformed. Keep `.env` private and out of logs, screenshots and commits. The current local configuration has no writer credentials, so the CRUD feature gate remains off until this step is intentionally completed.

## 4. Switch profiles and start manually

Use a maintenance window and verify there is no existing Fuseki process using this TDB2 location. Keep the same `FUSEKI_BASE`, working directory, port, and persistent `data/assurance` path. Never run both profiles at once.

```powershell
$fusekiHome = 'C:\path\to\apache-jena-fuseki-6.2.0'
$fusekiBase = 'C:\Users\Dhib\tools\assurance-fuseki-runtime'
$configPath = Join-Path $fusekiBase 'assurance-write.ttl'
Push-Location $fusekiBase
try {
    & java -jar (Join-Path $fusekiHome 'fuseki-server.jar') --localhost --port=3030 "--config=$configPath"
} finally {
    Pop-Location
}
```

Run the command manually only after checking the Fuseki 6.2.0 distribution's expected `FUSEKI_BASE` behavior and the profile pairing. Start the backend and frontend using the repository's normal documented commands only after Fuseki's security configuration is in place. This guide does not launch any processes. If startup reports config or authorization errors, stop; do not remove authentication rules or fall back to an unauthenticated endpoint.

## 5. Manual security and persistence acceptance

These are steps for you to execute in a separately authorized manual session. They were **not** executed here:

1. Confirm the process command binds only to loopback and uses the existing Fuseki base and `data/assurance` directory.
2. Confirm anonymous SELECT is available on `/assurance/query` and update without writer credentials is denied.
3. Confirm wrong writer credentials are denied, correct writer credentials are accepted only on `/assurance/update`, and the writer cannot access `/$/` administration endpoints.
4. Confirm there are no upload or Graph Store write routes in the active service configuration and port 3030 is not exposed beyond loopback.
5. Sign in as `VIEWER`; confirm reads work and POST/PATCH/DELETE are denied. Sign in as `AGENT` and `ADMIN`; verify allowed operations. Confirm CSRF/Origin validation remains effective.
6. Create a uniquely named test claim with valid existing RDF references, read it back, edit it using its current revision, and delete it. Confirm stale revisions fail safely. Never use `S2026_014`, `Karim`, `Leila`, or another original individual as a mutation target.
7. Stop Fuseki normally, restart it against the same store, and verify the test claim's final state and original claim relationship remain intact.
8. Restore read-only mode after acceptance if write access is not needed. Keep the backup until the rollback decision is complete.

Do not treat mocked tests, static checks, or an HTTP 2xx alone as proof of persistence/security. The application performs a post-write readback and revision check; the acceptance steps must still verify the actual Fuseki policy and on-disk TDB2 state.

## 6. Roll back to read-only mode

First stop the backend and Fuseki normally. Set `CLAIMS_MUTATIONS_ENABLED=false` in `backend/.env` and clear the update username/password. Restore the backed-up read-only `shiro.ini` and read-only Fuseki assembler/configuration for the **same** base and existing dataset. The base profile exposes only the query operation. Start one Fuseki process bound to loopback. No database restore is required to disable writes. If data restoration is necessary, stop Fuseki and follow your approved TDB2 restore procedure using the backup; never overwrite a live dataset.

## Existing safeguards and limitations

- No general SPARQL Update route exists. Only fixed validated claim operations are available.
- Writes use backend-only Basic credentials, a server-side feature gate, session authentication, RBAC, CSRF/Origin protection, provenance restrictions and conditional revision guards.
- Fuseki 6.2.0 config parsing, Shiro behavior, active listener binding, authenticated updates, transaction behavior and TDB2 persistence have not been tested here.
- The current local backend environment has mutations disabled and writer credentials absent. Consequently, real mutation requests will remain disabled until you follow this guide and intentionally configure private credentials.
- Login brute-force controls are governed by the current authentication implementation; this CRUD change does not alter the login flow.
