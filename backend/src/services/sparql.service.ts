import type { QueryName } from '../sparql/queries.js';
import type { SparqlReader } from '../sparql/client.js';

export class SparqlService {
  constructor(private readonly reader: SparqlReader) {}
  retrieve(name: QueryName) { return this.reader.select(name); }
}
