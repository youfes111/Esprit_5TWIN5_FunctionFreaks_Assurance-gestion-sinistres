import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { ThemeProvider } from '../src/design/theme';
import { TooltipProvider } from '../src/components/ui/tooltip';
import { AppLayout, SidebarContent } from '../src/layouts/AppLayout';
import { PageHeader } from '../src/components/PageHeader';
import { ClaimForm } from '../src/components/ClaimForm';
import { DataState } from '../src/components/DataState';
import { NlpResults } from '../src/components/NlpResults';
import { graphStyles } from '../src/utils/graph-style';
import { entrance } from '../src/design/motion';
import { ChatbotProvider } from '../src/features/chatbot/ChatbotProvider';
import type { NlpAnswer } from '../src/types/nlp';
import {authFixture} from './auth-fixture';

const originalFetch = globalThis.fetch;
before(() => { globalThis.fetch = (() => { throw new Error('Network is prohibited in isolated UI tests.'); }) as typeof fetch; });
after(() => { globalThis.fetch = originalFetch; });
function render(node: ReturnType<typeof createElement>, path = '/') {
  const client = { examples:async()=>[], ask:async()=>{ throw new Error('Unexpected request during SSR.'); } };
  return renderToStaticMarkup(authFixture(createElement(ThemeProvider, null, createElement(TooltipProvider, null, createElement(ChatbotProvider,{client},createElement(MemoryRouter, {initialEntries:[path]}, node))))));
}

test('collapsed tooltip links retain navigation classes and exactly one active route', () => {
  for (const path of ['/', '/sinistres', '/ontologie', '/sparql']) {
    const html = render(createElement(SidebarContent, { collapsed:true, channel:'test' }), path);
    const links = [...html.matchAll(/<a\b[^>]*>/g)].map(match=>match[0]).filter(tag=>!tag.includes('class="brand"'));
    assert.equal(links.length, 8);
    for (const tag of links) {
      assert.match(tag, /class="nav-item(?: active)?"/, tag);
      assert.match(tag, /aria-label="[^"]+"/);
    }
    assert.equal(links.filter(tag=>tag.includes('class="nav-item active"')).length, 1);
    assert.ok(links.find(tag=>tag.includes(`href="${path}"`))?.includes('aria-current="page"'));
  }
});
test('page headings are named and programmatically focusable, with real contextual actions', () => {
  const html = render(createElement(PageHeader, { eyebrow:'Pilotage', title:'Mes dossiers', description:'Données du graphe.' }));
  assert.match(html, /<h1 tabindex="-1">Mes dossiers<\/h1>/);
  assert.match(html, /Données du graphe/);
});
test('shell exposes only implemented navigation destinations, a skip link and theme control', () => {
  const html = render(createElement(Routes, null, createElement(Route, { element:createElement(AppLayout) }, createElement(Route, { index:true, element:createElement('p', null, 'Route active') }))));
  for (const path of ['/', '/sinistres', '/ontologie', '/sparql']) assert.ok(html.includes(`href="${path}"`));
  assert.ok(!html.includes('href="/assistant"')); assert.ok(!html.includes('Ouvrir l’assistant NLP'));
  for(const path of ['/contrats','/assures','/experts','/dommages'])assert.ok(html.includes(`href="${path}"`));
  assert.match(html, /Aller au contenu/); assert.match(html, /Ouvrir la navigation/);
  assert.match(html, /Choisir le thème/); assert.match(html, /aria-expanded="true"/);
});
test('claims requires session permissions and independent RDF write mode, without a legacy token dialog', () => {
  // Static UI guard check: no Vite environment or request module is executed.
  const source = readFileSync(new URL('../src/pages/ClaimsPage.tsx',import.meta.url),'utf8');
  assert.match(source, /disabled=\{!writable \|\| busy \|\| loading\}/);
  assert.match(source, /!claim.editable/); assert.match(source, /confirmation !== deleting\?\.id/);
  assert.ok(!source.includes('Accès de démonstration')); assert.match(source, /user\?\.role==='ADMIN'/);assert.match(source,/options\?\.mutationsEnabled/);assert.match(source, /<AlertDialog /);
});
test('claim form preserves date/identifier constraints, false fraud input and optional reference values', () => {
  const html = render(createElement(ClaimForm, { claim:null, options:{insured:['TEST_PERSON'],contracts:['TEST_CONTRACT'],experts:[],damages:[],mutationsEnabled:true},busy:false,onSave:async()=>{},onCancel:()=>{} }));
  assert.match(html, /type="date"/); assert.match(html, /max="9999-12-31"/);
  assert.match(html, /pattern="\[A-Za-z\]\[A-Za-z0-9_\]\{0,63\}"/);
  assert.match(html, /type="submit"/); assert.match(html, /type="button"/);
  assert.match(html, /value="TEST_PERSON"/); assert.match(html, /Non affecté/);
  assert.ok(!/type="checkbox"[^>]*checked/.test(html));
});
test('assistant composer has a label, bounded input, keyboard guidance and live status region', () => {
  const source=readFileSync(new URL('../src/features/chatbot/ChatbotPanel.tsx',import.meta.url),'utf8');
  assert.match(source, /htmlFor="global-nlp-question"/); assert.match(source, /maxLength=\{500\}/);
  assert.match(source, /role="log"/); assert.match(source, /aria-live="polite"/);
  assert.match(source, /Entrée pour envoyer/); assert.match(source, /Pas de LLM/);
});
test('assistant results retain accessible results/analysis/SPARQL tabs and factual explanation', () => {
  const answer:NlpAnswer = { question:'Liste les sinistres', intent:'list_claims', entities:[], preprocessing:{normalized:'liste les sinistres',tokens:['liste','les','sinistres'],stems:['list','le','sinistr']},plan:{intent:'list_claims'},sparql:'SELECT ?claim WHERE {} LIMIT 100',results:{head:{vars:['claim']},results:{bindings:[]}},resultCount:0,truncated:false,explanation:'Aucun résultat RDF.',rule:'Domaine sinistre.' };
  const html = render(createElement(NlpResults,{answer}));
  assert.match(html, /role="tablist"/); assert.match(html, /Analyse NLP/); assert.match(html, /SPARQL/); assert.match(html, /Aucun résultat RDF/);
});
test('explorer never renders a free-text query editor, while errors remain announced', () => {
  const source=readFileSync(new URL('../src/pages/SparqlPage.tsx',import.meta.url),'utf8');
  assert.match(source, /Lecture seule/); assert.ok(!/<(?:Textarea|textarea)/.test(source));
  assert.match(render(createElement(DataState,{error:'RDF indisponible'})), /role="alert"/);
  assert.match(render(createElement(DataState,{empty:true,label:'Aucune ligne'})), /role="status"/);
});
function luminance(hex:string) {
  const rgb=hex.replace('#','').match(/.{2}/g)!.map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  return .2126*rgb[0]!+.7152*rgb[1]!+.0722*rgb[2]!;
}
const contrast=(a:string,b:string)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
test('core theme text/background pairs meet WCAG AA normal-text contrast', () => {
  const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
  const light=css.slice(css.indexOf(':root'),css.indexOf('.dark {'));
  const dark=css.slice(css.indexOf('.dark {'),css.indexOf('@theme inline'));
  const value=(block:string,key:string)=>new RegExp(`--${key}:\\s*(#[0-9a-f]{6}|#[0-9a-f]{3});`,'i').exec(block)?.[1];
  const expand=(value:string)=>value.length===4?'#'+[...value.slice(1)].map(c=>c+c).join(''):value;
  for(const block of [light,dark]){
    const get=(key:string)=>expand(value(block,key)??value(light,key)!);
    for(const [fg,bg] of [['foreground','background'],['muted-foreground','card'],['primary-foreground','primary'],['destructive','error-soft']])assert.ok(contrast(get(fg!),get(bg!))>=4.5,`${fg}/${bg}`);
  }
});
test('reduced-motion entrance disables transforms and graph styles use supplied semantic tokens', () => {
  const reduced=entrance(true); assert.equal(reduced.initial,false); assert.deepEqual(reduced.transition,{duration:0}); assert.equal(reduced.exit.y,0);
  const palette={foreground:'#111111',muted:'#555555',surface:'#ffffff',primary:'#008866',classes:'#112233',individuals:'#223344',properties:'#334455',edges:'#445566',warning:'#556677'};
  const styles=graphStyles(palette);
  const styleFor=(selector:string)=>styles.find(style=>style.selector===selector)?.style as Record<string,unknown> | undefined;
  assert.equal(styleFor('node[category = "class"]')?.['background-color'],palette.classes);
  assert.equal(styleFor('node:selected')?.['border-color'],palette.primary);
  assert.equal(styleFor('.filtered-out')?.display,'none');
});
