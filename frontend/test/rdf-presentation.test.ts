import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {iriLocalName,rdfDisplayValue,resultCountLabel,chatExplanation} from '../src/utils/rdf-presentation';
import {ChatbotResults} from '../src/components/ChatbotResults';
import {RdfValue} from '../src/components/RdfValue';
import type {SelectResults} from '../src/types/visualization';
import type {RdfTerm,NlpAnswer} from '../src/types/nlp';
const uri=(value:string):RdfTerm=>({type:'uri',value});
const render=(results:SelectResults)=>renderToStaticMarkup(createElement(ChatbotResults,{results}));
test('fragment and path IRIs have readable decoded labels, while their exact values remain intact',()=>{
  for(const [iri,label] of [['http://www.example.org/assurance#S2026_014','S2026_014'],['https://example.org/contracts/AUTO_882','AUTO_882'],['https://example.org/experts/Karim/?q=1','Karim'],['https://example.org/#%C3%A9valu%C3%A9','évalué'],['https://example.org/#bad%xx','bad%xx']]){
    const term=Object.freeze(uri(iri!));assert.equal(iriLocalName(term.value),label);const html=renderToStaticMarkup(createElement(RdfValue,{term}));assert.ok(html.includes(label!));assert.ok(html.includes(iri!));assert.match(html,/Copier l’URI/);assert.equal(term.value,iri);
  }
  assert.equal(iriLocalName('https://example.org'),'https://example.org');
});
test('blank nodes are not mistaken for links and literal lexical forms and RDF metadata survive',()=>{
  assert.equal(rdfDisplayValue({type:'bnode',value:'b12'}),'Nœud anonyme _:b12');
  assert.equal(rdfDisplayValue({type:'bnode',value:'_:b12'}),'Nœud anonyme _:b12');
  for(const term of [{type:'literal',value:'000123.4500',datatype:'http://www.w3.org/2001/XMLSchema#decimal'},{type:'literal',value:'false',datatype:'http://www.w3.org/2001/XMLSchema#boolean'},{type:'literal',value:'Bonjour', 'xml:lang':'fr'}] satisfies RdfTerm[]){
    assert.equal(rdfDisplayValue(term),term.value);const html=renderToStaticMarkup(createElement(RdfValue,{term}));assert.ok(html.includes(term.value));assert.match(html,/Copier la valeur/);if('datatype' in term)assert.ok(html.includes(term.datatype!));else assert.match(html,/Langue/);
  }
});
test('small result cards expose only actual returned fields and preserve duplicate rows',()=>{
  const row={claim:uri('http://example.org/#S2026_014'),contract:uri('http://example.org/contracts/AUTO_882')};
  const results:SelectResults={head:{vars:['claim','contract','expert']},results:{bindings:[row,row]}};const original=JSON.stringify(results);const html=render(results);
  assert.match(html,/chat-result-cards/);assert.match(html,/Sinistre/);assert.match(html,/S2026_014/);assert.match(html,/AUTO_882/);assert.ok(!html.includes('Expert'));assert.ok(!html.includes('<table'));
  assert.equal((html.match(/<header>/g)??[]).length,2);assert.equal(JSON.stringify(results),original);
});
test('empty results use natural French, without a blank table or fabricated fields',()=>{
  const html=render({head:{vars:['claim']},results:{bindings:[]}});assert.match(html,/Aucun résultat trouvé/);assert.ok(!html.includes('<table'));
  assert.equal(resultCountLabel(1),'1 résultat trouvé');assert.equal(resultCountLabel(3),'3 résultats trouvés');
});
test('larger multi-column results have a bounded keyboard-scrollable fixed-layout table and unbound cells',()=>{
  const results:SelectResults={head:{vars:['claim','contract','expert','status']},results:{bindings:Array.from({length:4},(_,i)=>({claim:uri(`http://example.org/#S${i}`),status:{type:'literal',value:'En cours'}}))}};
  const html=render(results);assert.match(html,/<table/);assert.match(html,/min-width:448px/);assert.match(html,/tabindex="0"/);assert.match(html,/role="region"/);assert.match(html,/Non renseigné/);assert.match(html,/4 résultats trouvés/);
});
test('long IRIs and unbroken literals stay selectable and escaped, with wrapping CSS at every result boundary',()=>{
  const long='x'.repeat(6000);const results:SelectResults={head:{vars:['claim','value']},results:{bindings:[{claim:uri(`https://example.org/${long}`),value:{type:'literal',value:long+'<script>'}}]}};
  const html=render(results);assert.ok(html.includes(long));assert.match(html,/&lt;script&gt;/);assert.ok(!html.includes('<script>'));
  const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');assert.match(css,/\.chat-rdf-table \{ table-layout:fixed/);assert.match(css,/\.rdf-value-label[^}]*overflow-wrap:anywhere/);assert.match(css,/\.chat-rdf-table-scroll[^}]*overflow:auto/);assert.match(css,/\.chatbot-panel \.chat-rdf-table td[^}]*white-space:normal/);
});
test('UI wording changes do not mutate the original backend explanation or precise aggregate',()=>{
  const answer={explanation:'1 ligne(s) RDF retournée(s). Plusieurs relations peuvent produire plusieurs lignes pour un même individu.'} as NlpAnswer;
  assert.equal(chatExplanation(answer),'Voici les informations retournées par le graphe d’assurance.');assert.match(answer.explanation,/ligne\(s\)/);
  const count={explanation:'Le graphe interrogé contient 99999999999999999999 sinistre(s) explicitement typé(s).',totalClaims:'99999999999999999999'} as NlpAnswer;assert.ok(chatExplanation(count).includes(count.totalClaims!));
});
