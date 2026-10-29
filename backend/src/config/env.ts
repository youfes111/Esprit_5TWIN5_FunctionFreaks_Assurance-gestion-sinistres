import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { validateQueryEndpoint } from '../sparql/client.js';
import { validateUpdateEndpoint } from '../services/claims.repository.js';

export const backendRoot = fileURLToPath(new URL('../../', import.meta.url));
dotenv.config({ path: resolve(backendRoot, '.env'), quiet: true });
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}
export const env = {
  port,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  ontologyPath: resolve(backendRoot, process.env.ONTOLOGY_PATH ?? '../ontology/assurance.owl'),
  fusekiQueryEndpoint: validateQueryEndpoint(process.env.FUSEKI_QUERY_ENDPOINT ?? 'http://127.0.0.1:3030/assurance/query'),
  sparqlTimeoutMs: Number(process.env.SPARQL_TIMEOUT_MS ?? 5000),
  mutationsEnabled: process.env.CLAIMS_MUTATIONS_ENABLED === 'true',
  fusekiUpdateEndpoint: process.env.FUSEKI_UPDATE_ENDPOINT ?? 'http://127.0.0.1:3030/assurance/update',
  fusekiUpdateUsername: process.env.FUSEKI_UPDATE_USERNAME ?? '',
  fusekiUpdatePassword: process.env.FUSEKI_UPDATE_PASSWORD ?? '',
};
if (!Number.isInteger(env.sparqlTimeoutMs) || env.sparqlTimeoutMs < 1 || env.sparqlTimeoutMs > 60000) {
  throw new Error('SPARQL_TIMEOUT_MS must be an integer between 1 and 60000.');
}
if (process.env.CLAIMS_MUTATIONS_ENABLED && !['true', 'false'].includes(process.env.CLAIMS_MUTATIONS_ENABLED)) throw new Error('CLAIMS_MUTATIONS_ENABLED must be true or false.');
if (env.mutationsEnabled) {
  validateUpdateEndpoint(env.fusekiQueryEndpoint, env.fusekiUpdateEndpoint);
  if (!env.fusekiUpdateUsername || env.fusekiUpdateUsername.includes(':') || !env.fusekiUpdatePassword) throw new Error('Enabled mutations require Fuseki update credentials.');
}
