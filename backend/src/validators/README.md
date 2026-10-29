`read-only-sparql.ts` enforces GET-only SPARQL resources and rejects query parameters or bodies. Future business input validators belong here. JSON syntax and size limits are handled centrally.

Phase 2 `claims.ts` validates strict identifiers, calendar dates, the application status enum, boolean flags, decimal strings, pagination and immutable revision tokens. Unknown fields are rejected. Insured/contract compatibility and RDF reference checks live in ClaimsService and are repeated in conditional SPARQL writes.
