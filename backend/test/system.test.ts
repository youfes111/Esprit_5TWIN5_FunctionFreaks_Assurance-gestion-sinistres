import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { loadOntology } from '../src/services/ontology.service.js';
import {AuthDatabase} from '../src/auth/database.js';
import {AuthService} from '../src/auth/service.js';
import {authConfig} from '../src/auth/config.js';

test('real ontology has the expected explicit declarations and label', async () => {
  const summary = await loadOntology(env.ontologyPath);
  assert.equal(summary.classCount, 20);
  assert.equal(summary.individualCount, 5);
  assert.equal(summary.name, 'Assurance & Gestion des Sinistres');
  assert.equal(summary.iri, 'http://www.example.org/assurance');
});

test('health is public, summary requires a session, and invalid JSON keeps its controlled envelope', async () => {
  const summary = await loadOntology(env.ontologyPath);
  // This listener-based suite remains excluded from no-live test:unit.
  // Even when run later, it must never open the real authentication database.
  const store=new AuthDatabase(':memory:');
  const authentication=new AuthService(store,authConfig());
  const app = createApp(summary,undefined,authentication);
  try {
  const health = await request(app).get('/api/health').expect(200);
  assert.deepEqual(health.body, { success: true, data: { status: 'ok', service: 'assurance-api' } });
  await request(app).get('/api/ontology/summary').expect(401);
  const owner=await authentication.bootstrap('Test Admin','test@example.org','Private integration password');
  const login=await authentication.login(owner.email,'Private integration password');
  const response=await request(app).get('/api/ontology/summary').set('Cookie',`assurance-session=${login.token}`).expect(200);
  assert.deepEqual(response.body,{success:true,data:summary});
  const missing=await request(app).get('/api/missing').set('Cookie',`assurance-session=${login.token}`).expect(404);assert.equal(missing.body.error.code,'NOT_FOUND');
  const invalid = await request(app).post('/api/health').set('Content-Type', 'application/json').send('{').expect(400);
  assert.equal(invalid.body.error.code, 'INVALID_JSON');
  }finally{store.close();}
});

test('missing and malformed ontology files fail instead of returning invented counts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'assurance-test-'));
  try {
    await assert.rejects(loadOntology(join(directory, 'missing.owl')));
    const path = join(directory, 'invalid.owl');
    await writeFile(path, '<rdf:RDF><broken>');
    await assert.rejects(loadOntology(path));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
