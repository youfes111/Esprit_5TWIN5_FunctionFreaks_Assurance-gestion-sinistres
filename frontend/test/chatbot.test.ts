import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createChatStore } from '../src/features/chatbot/store';
import { ChatbotProvider } from '../src/features/chatbot/ChatbotProvider';
import { GlobalChatbot } from '../src/features/chatbot/GlobalChatbot';
import { ThemeProvider } from '../src/design/theme';
import { graphLayout, positionedGraphElements } from '../src/utils/graph-layout';
import { AnalyticsChart } from '../src/components/AnalyticsChart';
import type { NlpAnswer } from '../src/types/nlp';
import type { OntologyGraph } from '../src/types/visualization';

const answer: NlpAnswer = { question:'Liste les sinistres',intent:'list_claims',entities:[],preprocessing:{normalized:'liste les sinistres',tokens:['liste','les','sinistres'],stems:['list','le','sinistr']},plan:{intent:'list_claims'},sparql:'SELECT ?claim WHERE {} LIMIT 100',results:{head:{vars:['claim']},results:{bindings:[]}},resultCount:0,truncated:false,explanation:'Aucun résultat RDF.',rule:'Nom de domaine sinistre.' };
function deferred<T>() { let resolve!:(value:T)=>void; let reject!:(reason:unknown)=>void; const promise = new Promise<T>((yes,no)=>{resolve=yes;reject=no;}); return {promise,resolve,reject}; }
test('opening/closing caches examples and preserves draft, history and requests across simulated route consumers', async()=>{
  let calls=0; const examples=deferred<string[]>();
  const store=createChatStore({examples:()=>{calls++;return examples.promise;},ask:async()=>answer});
  store.actions.open(); store.actions.open(); store.actions.close(); store.actions.open();
  await Promise.resolve(); assert.equal(calls,1); examples.resolve(['Liste les sinistres']); await store.actions.retryExamples();
  store.actions.setQuestion('Liste les sinistres'); await store.actions.submit();
  store.actions.setQuestion('Mon brouillon'); store.actions.close();
  // Route unsubscription must not dispose the application-level store.
  const unsubscribe=store.subscribe(()=>{}); unsubscribe(); const nextRouteSnapshot=store.getSnapshot();
  assert.equal(nextRouteSnapshot.turns.length,1); assert.equal(nextRouteSnapshot.question,'Mon brouillon');
  store.actions.open(); assert.equal(store.getSnapshot().open,true); assert.equal(calls,1); assert.equal(store.getSnapshot().turns[0]?.answer,answer);
});
test('submission uses the injected existing-client signature once and a closed panel can finish its request', async()=>{
  const pending=deferred<NlpAnswer>(); const calls:{question:string;signal?:AbortSignal}[]=[];
  const store=createChatStore({examples:async()=>[],ask:(question,signal)=>{calls.push({question,signal});return pending.promise;}});
  store.actions.setQuestion('  Liste les sinistres  '); const first=store.actions.submit();
  assert.equal(store.getSnapshot().busy,true); assert.equal(await store.actions.submit(),false); assert.equal(store.actions.clear(),false);
  store.actions.close(); assert.equal(calls.length,1); assert.equal(calls[0]?.question,'Liste les sinistres'); assert.equal(calls[0]?.signal?.aborted,false);
  pending.resolve(answer); await first;
  assert.equal(store.getSnapshot().busy,false); assert.equal(store.getSnapshot().turns[0]?.answer,answer);
});
test('empty questions are rejected and API errors remain readable without fabricated answers',async()=>{
  const store=createChatStore({examples:async()=>[],ask:async()=>{throw new Error('Question ambiguë.');}});
  store.actions.setQuestion('  ');assert.equal(await store.actions.submit(),false);
  store.actions.setQuestion('Quels sinistres ?');await store.actions.submit();
  assert.equal(store.getSnapshot().turns[0]?.error,'Question ambiguë.');assert.equal(store.getSnapshot().turns[0]?.answer,undefined);assert.equal(store.getSnapshot().busy,false);
});
test('history remains bounded at ten exchanges and explicit clear does not refetch suggestions',async()=>{
  let catalogueCalls=0;
  const store=createChatStore({examples:async()=>{catalogueCalls++;return ['Exemple'];},ask:async()=>answer});
  store.actions.open();await store.actions.retryExamples();
  for(let i=0;i<12;i++){store.actions.setQuestion(`Question ${i}`);await store.actions.submit();}
  assert.equal(store.getSnapshot().turns.length,10);assert.equal(store.getSnapshot().turns[0]?.question,'Question 2');
  assert.equal(store.actions.clear(),true);assert.deepEqual(store.getSnapshot().turns,[]);assert.deepEqual(store.getSnapshot().examples,['Exemple']);assert.equal(catalogueCalls,1);
});
test('failed examples retry on demand, while provider disposal aborts work and ignores late responses',async()=>{
  let calls=0;const pending=deferred<NlpAnswer>();let signal:AbortSignal|undefined;
  const store=createChatStore({examples:async()=>{if(++calls===1)throw new Error('Exemples indisponibles');return ['Question'];},ask:(_q,s)=>{signal=s;return pending.promise;}});
  store.actions.open();await store.actions.retryExamples();assert.equal(store.getSnapshot().examplesStatus,'error');
  await store.actions.retryExamples();assert.equal(store.getSnapshot().examplesStatus,'loaded');
  store.actions.setQuestion('Liste les sinistres');const request=store.actions.submit();store.dispose();assert.equal(signal?.aborted,true);
  pending.resolve(answer);await request;assert.equal(store.getSnapshot().turns[0]?.answer,undefined);
});
test('the global launcher has a dialog name and the legacy route replaces rather than pushes history',()=>{
  const client={examples:async()=>[],ask:async()=>answer};
  const html=renderToStaticMarkup(createElement(ThemeProvider,null,createElement(ChatbotProvider,{client},createElement(GlobalChatbot))));
  assert.match(html,/aria-label="Ouvrir l’assistant NLP"/);assert.match(html,/aria-expanded="false"/);
  const redirect=readFileSync(new URL('../src/features/chatbot/LegacyAssistantRedirect.tsx',import.meta.url),'utf8');
  assert.match(redirect,/actions\.openChat\(\)/);assert.match(redirect,/navigate\('\/', \{ replace:true \}\)/);
  const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
  assert.match(app,/<ChatbotProvider client=\{nlpApi\}>/);assert.match(app,/<Outlet\/><GlobalChatbot/);assert.match(app,/<RequireAuth\//);assert.ok(!app.includes('NlpPage'));
});
test('single-category analytics shows the exact value compactly with its data table',()=>{
  const html=renderToStaticMarkup(createElement(AnalyticsChart,{title:'Dommages',description:'Source RDF',amount:true,data:{items:[{label:'PareChoc',value:1450,exactValue:'1450.00'}],truncated:false}}));
  assert.match(html,/single-chart-value/);assert.match(html,/1450\.00/);assert.match(html,/<table/);assert.ok(!html.includes('recharts-wrapper'));
});
test('filter toolbar, analytics grid and graph text mode use compact independent containers',()=>{
  const claims=readFileSync(new URL('../src/pages/ClaimsPage.tsx',import.meta.url),'utf8');
  assert.match(claims,/className="filter-fields"/);assert.match(claims,/className="filter-actions"/);assert.match(claims,/changed\('search', search\)/);
  const graph=readFileSync(new URL('../src/pages/OntologyPage.tsx',import.meta.url),'utf8');assert.match(graph,/graph-accessibility"><details><summary>/);
  const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');assert.match(css,/\.analytics-grid \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);assert.match(css,/\.claims-filters \{ display:grid/);
});
test('graph layouts are bounded/deterministic and seeded elements preserve RDF data',()=>{
  assert.equal(graphLayout(10).name,'cose');assert.equal(graphLayout(200).name,'grid');assert.equal(graphLayout(0).name,'preset');
  const graph:OntologyGraph={view:'individuals',source:'mock',truncated:false,nodes:[{id:'urn:one',iri:'urn:one',label:'One',category:'individual',categories:['individual'],types:[]}],edges:[]};
  const original=JSON.stringify(graph);assert.deepEqual(positionedGraphElements(graph),positionedGraphElements(graph));assert.equal(JSON.stringify(graph),original);
});
