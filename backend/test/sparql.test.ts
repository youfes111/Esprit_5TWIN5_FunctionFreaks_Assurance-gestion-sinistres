import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { SparqlClient, type SelectResults } from '../src/sparql/client.js';
import { queries, isQueryName, type QueryName } from '../src/sparql/queries.js';
import { SparqlError } from '../src/sparql/sparql-error.js';
import { SparqlService } from '../src/services/sparql.service.js';
import { sparqlResults } from '../src/controllers/sparql.controller.js';
import { readOnlySparql } from '../src/validators/read-only-sparql.js';
import { errorHandler } from '../src/middleware/error-handler.js';

// All transport calls are injected mocks. These tests never bind ports or use real fetch.
const endpoint = 'http://127.0.0.1:3030/assurance/query';
const empty: SelectResults = { head: { vars: [] }, results: { bindings: [] } };
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/sparql-results+json' } });
const errorCode = (code: string) => (error: unknown) => error instanceof SparqlError && error.code === code;

test('every registered operation sends only its fixed SELECT using the query protocol', async () => {
  for (const name of Object.keys(queries) as QueryName[]) {
    let calls = 0;
    const transport: typeof fetch = async (url, init) => {
      calls++;
      assert.equal(url, endpoint);
      assert.equal(init?.method, 'POST');
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.body, queries[name]);
      assert.ok(init?.signal instanceof AbortSignal);
      assert.equal(new Headers(init?.headers).get('Accept'), 'application/sparql-results+json');
      assert.match(new Headers(init?.headers).get('Content-Type') ?? '', /^application\/sparql-query/);
      assert.match(queries[name], /SELECT DISTINCT/);
      assert.doesNotMatch(queries[name], /\b(UPDATE|INSERT|DELETE|SERVICE|LOAD|CLEAR|DROP|CREATE|COPY|MOVE|ADD)\b/i);
      return json(empty);
    };
    assert.deepEqual(await new SparqlClient(endpoint, 5000, transport).select(name), empty);
    assert.equal(calls, 1);
  }
});

test('preserves RDF terms and accepts successful empty SELECT results', async () => {
  const result: SelectResults = {
    head: { vars: ['claim', 'expert', 'status', 'date'] },
    results: { bindings: [{
      claim: { type: 'uri', value: 'http://www.example.org/assurance#S2026_014' },
      expert: { type: 'uri', value: 'http://www.example.org/assurance#Karim' },
      status: { type: 'literal', value: 'En cours', 'xml:lang': 'fr' },
      date: { type: 'literal', value: '2026-03-15', datatype: 'http://www.w3.org/2001/XMLSchema#date' },
    }] },
  };
  const client = new SparqlClient(endpoint, 5000, async () => json(result));
  assert.deepEqual(await client.select('example-karim'), result);
  assert.match(queries['example-karim'], /assurance:évaluéPar/);
  assert.match(queries['example-karim'], /assurance:S2026_014/);
  assert.match(queries['example-karim'], /assurance:Karim/);
});

test('unregistered queries, mutation text, federation and prototype names never reach transport', async () => {
  let calls = 0;
  const client = new SparqlClient(endpoint, 5000, async () => { calls++; return json(empty); });
  for (const name of ['UPDATE', 'INSERT DATA {}', 'DELETE WHERE {}', 'SELECT * WHERE { SERVICE <http://example.org> {} }', 'toString', '__proto__']) {
    assert.equal(isQueryName(name), false);
    await assert.rejects(client.select(name as QueryName), errorCode('INVALID_SPARQL_OPERATION'));
  }
  assert.equal(calls, 0);
});

test('upstream failures use controlled errors without leaking response bodies', async () => {
  await assert.rejects(new SparqlClient(endpoint, 5000, async () => { throw new TypeError('connection refused'); }).select('classes'), errorCode('SPARQL_UNAVAILABLE'));
  await assert.rejects(new SparqlClient(endpoint, 5000, async () => new Response('private upstream details', { status: 503 })).select('classes'), errorCode('SPARQL_HTTP_ERROR'));
  for (const response of [
    new Response('<html>error</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    json({ boolean: true }),
    json({ head: { vars: ['x'] }, results: { bindings: [{ x: { type: 'literal', value: 7 } }] } }),
  ]) {
    await assert.rejects(new SparqlClient(endpoint, 5000, async () => response).select('classes'), errorCode('SPARQL_INVALID_RESPONSE'));
  }
});

test('timeout aborts the injected transport', async () => {
  const transport: typeof fetch = (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('mock aborted')), { once: true });
  });
  await assert.rejects(new SparqlClient(endpoint, 5, transport).select('claims'), errorCode('SPARQL_TIMEOUT'));
});

test('endpoint and timeout configuration reject unsafe or invalid values', () => {
  for (const url of ['file:///query', 'http://localhost:3030/assurance/update', 'http://user:password@localhost:3030/assurance/query', `${endpoint}?query=SELECT`, `${endpoint}#fragment`]) {
    assert.throws(() => new SparqlClient(url));
  }
  for (const ms of [0, -1, NaN, 1.5, 60001]) assert.throws(() => new SparqlClient(endpoint, ms));
});

// Exercise Express handlers directly; do not use Supertest or start a server.
function responseStub() {
  const output: { status: number; body?: unknown; headers: Record<string, string> } = { status: 200, headers: {} };
  const response = {
    status(code: number) { output.status = code; return response; },
    json(body: unknown) { output.body = body; return response; },
    setHeader(key: string, value: string) { output.headers[key] = value; return response; },
  };
  return { output, response: response as unknown as Response };
}

test('read-only HTTP guard rejects methods, parameters, and bodies', () => {
  const cases = [
    { method: 'POST', status: 405 }, { method: 'HEAD', status: 405 },
    { method: 'GET', query: { query: 'DELETE WHERE {}' }, status: 400 },
    { method: 'GET', query: { endpoint: 'http://example.org' }, status: 400 },
    { method: 'GET', body: {}, status: 400 },
    { method: 'GET', headers: { 'content-length': '5' }, status: 400 },
  ];
  for (const entry of cases) {
    const { response, output } = responseStub();
    let nextCalled = false;
    readOnlySparql({ query: {}, headers: {}, ...entry } as unknown as Request, response, () => { nextCalled = true; });
    assert.equal(output.status, entry.status);
    assert.equal(nextCalled, false);
    if (entry.status === 405) assert.equal(output.headers.Allow, 'GET');
  }
  let nextCalled = false;
  readOnlySparql({ method: 'GET', query: {}, headers: {} } as Request, responseStub().response, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('service/controller preserve the API envelope and middleware maps upstream errors', async () => {
  const names: QueryName[] = [];
  const service = new SparqlService({ async select(name) { names.push(name); return empty; } });
  const { response, output } = responseStub();
  await sparqlResults(service, 'classes')({} as Request, response, () => {});
  assert.deepEqual(names, ['classes']);
  assert.deepEqual(output.body, { success: true, data: empty });
  for (const [code, status] of [['SPARQL_TIMEOUT', 504], ['SPARQL_UNAVAILABLE', 502]] as const) {
    const stub = responseStub();
    errorHandler(new SparqlError(code, 'Controlled message', status), {} as Request, stub.response, () => {});
    assert.equal(stub.output.status, status);
    assert.deepEqual(stub.output.body, { success: false, error: { code, message: 'Controlled message' } });
  }
});
