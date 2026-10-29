import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { RdfXmlParser } from 'rdfxml-streaming-parser';
import type { Quad } from '@rdfjs/types';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const OWL = 'http://www.w3.org/2002/07/owl#';
const LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';

export interface OntologySummary {
  name: string;
  iri: string;
  classCount: number;
  individualCount: number;
  objectPropertyCount: number;
  dataPropertyCount: number;
}

// Explicit named declarations only; this is not OWL inference or a SPARQL engine.
export async function loadOntology(path: string): Promise<OntologySummary> {
  const xml = await readFile(path, 'utf8');
  const rdfRoot=/<([A-Za-z_][\w.-]*):RDF\b([^>]*)>/i.exec(xml);
  if(rdfRoot&&!new RegExp(`(?:^|\\s)xmlns:${rdfRoot[1]}\\s*=`).test(rdfRoot[2]!))throw new Error('The RDF/XML root uses an undeclared namespace prefix.');
  const parser = new RdfXmlParser({ baseIRI: pathToFileURL(path).href });
  const declarations = new Map<string, Set<string>>();
  const labels = new Map<string, string>();
  const parsed = new Promise<void>((resolve, reject) => {
    parser.on('data', (quad: Quad) => {
      if (quad.subject.termType !== 'NamedNode') return;
      if (quad.predicate.value === RDF_TYPE && quad.object.termType === 'NamedNode') {
        const subjects = declarations.get(quad.object.value) ?? new Set<string>();
        subjects.add(quad.subject.value);
        declarations.set(quad.object.value, subjects);
      }
      if (quad.predicate.value === LABEL && quad.object.termType === 'Literal') {
        labels.set(quad.subject.value, quad.object.value);
      }
    });
    parser.once('error', reject);
    parser.once('end', resolve);
  });
  parser.end(xml);
  await parsed;
  const iri = declarations.get(`${OWL}Ontology`)?.values().next().value;
  if (!iri) throw new Error('The RDF/XML file does not declare an owl:Ontology.');
  const count = (type: string) => declarations.get(`${OWL}${type}`)?.size ?? 0;
  return {
    name: labels.get(iri) ?? iri,
    iri,
    classCount: count('Class'),
    individualCount: count('NamedIndividual'),
    objectPropertyCount: count('ObjectProperty'),
    dataPropertyCount: count('DatatypeProperty'),
  };
}
