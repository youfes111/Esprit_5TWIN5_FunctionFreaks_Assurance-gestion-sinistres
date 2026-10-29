# Apache Jena Fuseki with persistent TDB2 (Windows PowerShell)

These are manual setup instructions. No Fuseki installation, import, server start, or HTTP check was executed during Phase 1. Docker is not required.

This guide remains the default **read-only** profile. Phase 2's optional authenticated update profile and demo write authorization are documented separately in [PHASE2.md](PHASE2.md). Never start the write assembler with this guide's anonymous query-only Shiro policy. Both profiles use the same persistent dataset directory and must never run simultaneously against it.

## 1. Install the Java tools manually

Download the binary distributions of **Apache Jena** (offline TDB2 tools) and **Apache Jena Fuseki** from the [official downloads page](https://jena.apache.org/download/). Use matching release versions and the JDK required by that release; check its release notes before installing Java. Extract them outside the repository, for example under `C:\Tools`. Set `JAVA_HOME` and add its `bin` directory to PATH using your JDK installation instructions. Distribution names and Java requirements can change; no release was downloaded or verified here.

Run the following only when you are ready for manual setup. Substitute your actual extraction paths:

```powershell
$projectRoot = 'C:\Users\Dhib\Documents\GitHub\Esprit_5TWIN5_FunctionFreaks_Assurance-gestion-sinistres'
$env:JENA_HOME = 'C:\Tools\apache-jena-<version>'
$env:FUSEKI_HOME = 'C:\Tools\apache-jena-fuseki-<version>'
$env:FUSEKI_BASE = Join-Path $projectRoot '.local\fuseki'
$datasetPath = Join-Path $env:FUSEKI_BASE 'data\assurance'
$configPath = Join-Path $projectRoot 'config\fuseki\assurance.ttl'
$ontologyPath = Join-Path $projectRoot 'ontology\assurance.owl'
java -version
```

The `.local/` directory is Git-ignored and holds persistent database files. Keep it across restarts. Do not place TDB2 files in the source ontology directory.

## 2. Create the dataset and import the OWL file offline

**Stop Fuseki before using any TDB2 command-line tool on this dataset.** Only one process may own a TDB2 directory at a time. For the first import, the dataset directory must be empty or absent. Do not repeat the initial import on an existing store as a refresh operation.

```powershell
New-Item -ItemType Directory -Force -Path $env:FUSEKI_BASE | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $datasetPath -Parent) | Out-Null
if ((Test-Path -LiteralPath $datasetPath) -and (Get-ChildItem -LiteralPath $datasetPath -Force | Select-Object -First 1)) {
    throw 'Dataset is not empty. Preserve the existing store; do not re-import blindly.'
}
Copy-Item -LiteralPath (Join-Path $projectRoot 'config\fuseki\shiro.ini') -Destination (Join-Path $env:FUSEKI_BASE 'shiro.ini')
& java -cp (Join-Path $env:JENA_HOME 'lib\*') tdb2.tdbloader "--loc=$datasetPath" $ontologyPath
if ($LASTEXITCODE -ne 0) { throw 'TDB2 import failed. Do not start Fuseki until resolved.' }
```

The loader creates the TDB2 dataset and imports the RDF/XML ontology into the **default graph**. It does not modify `ontology/assurance.owl`. The assembler configuration exposes that directory as the logical dataset `assurance`. No inference rules are enabled. Save the original file hash if you want an additional integrity check:

```powershell
Get-FileHash -LiteralPath $ontologyPath -Algorithm SHA256
```

Expected SHA-256: `1DA702515E9D96177C49C2A9721203275B6E41C553B23EBFEF3F2AAD3D9BE9A0`.

## 3. Start Fuseki manually after setup

Do not run this while offline tools have the dataset open. Use the same variables and start directory every time, so the relative `tdb2:location` resolves to the imported store:

```powershell
Push-Location $env:FUSEKI_BASE
try {
    & java -jar (Join-Path $env:FUSEKI_HOME 'fuseki-server.jar') --localhost --port=3030 "--config=$configPath"
} finally {
    Pop-Location
}
```

Keep the terminal open; Ctrl+C stops Fuseki. Persistent triples remain in `$datasetPath`. The configuration defines only `/assurance/query`, with no update, upload, or graph-store endpoint. The supplied `shiro.ini` denies `/$/**` administration requests and defines no administrative accounts. Keep this local study setup bound to loopback; production authentication and deployment are outside Phase 1. The security configuration and CLI compatibility remain unverified until manual startup with your selected distribution.

Do not create another dataset in Fuseki's administration UI. Do not add `--update`, use an update-capable convenience dataset, or expose Fuseki through the frontend proxy. The provided `--config` service is the intended read-only dataset.

## 4. Configure the backend

Merge these values into `backend/.env`; preserve existing Phase 0 variables:

```dotenv
FUSEKI_QUERY_ENDPOINT=http://127.0.0.1:3030/assurance/query
SPARQL_TIMEOUT_MS=5000
```

The endpoint must be an HTTP(S) URL ending in `/query`, without credentials, URL parameters, or fragments. Timeout is 1–60000 ms. These are backend variables only. The frontend continues to use `/api`; it never receives a Fuseki URL or credentials. No request to Fuseki is made during backend construction/startup: health and local ontology summary remain independent of Fuseki availability. A SPARQL request returns a controlled 502/504 error if the database is unavailable or times out.

## 5. Manual acceptance checks for a later authorized session

No live requests are included or executed in this delivery. Once services are explicitly allowed, verify the seven registered API routes in the README, the 20 declared classes / 5 individuals, and the `S2026_014 → évaluéPar → Karim` result. Verify unknown/raw-query requests are rejected, mutation endpoints and `/$/**` administration are inaccessible, and the data survives a clean restart. The existing automated tests are not proof of a real Fuseki installation.

If results are empty, first check that the offline loader and server use the exact same dataset directory and that the data was imported into the default graph. If the port is occupied, change the Fuseki port and the backend endpoint together. Never repair a locked store by deleting lock files while another process is using it. Back up the store only with Fuseki stopped or with a supported TDB2 backup procedure.
