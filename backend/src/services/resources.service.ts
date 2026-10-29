import { randomUUID } from "node:crypto";
import { AppError } from "../middleware/app-error.js";
import { iri, literal, NS, prefix } from "../sparql/claims.queries.js";
import type { SelectResults } from "../sparql/client.js";
import type {
  ResourceInput,
  ResourceKind,
  ResourceRecord,
} from "../types/resources.js";
import { resourceInput, resourceQuery } from "../validators/resources.js";

const APP = "urn:assurance:application:";
const cfg: Record<
  ResourceKind,
  {
    className: string;
    props: Record<string, string>;
    links: string[];
    blockedBy: string[];
  }
> = {
  insured: {
    className: "Assuré",
    props: {
      name: "displayName",
      email: "email",
      phone: "phone",
      address: "address",
    },
    links: ["contracts", "claims"],
    blockedBy: ["contracts", "claims"],
  },
  contract: {
    className: "Contrat",
    props: {
      identifier: "numéroContrat",
      name: "displayName",
      type: "contractType",
      status: "contractStatus",
      startDate: "startDate",
      endDate: "endDate",
      coverage: "coverage",
    },
    links: ["insured", "claims"],
    blockedBy: ["claims"],
  },
  expert: {
    className: "Expert",
    props: {
      name: "displayName",
      specialization: "specialization",
      email: "email",
      phone: "phone",
      availability: "availability",
    },
    links: ["claims"],
    blockedBy: ["claims"],
  },
  damage: {
    className: "Dommage",
    props: {
      name: "displayName",
      type: "damageType",
      description: "description",
      amount: "montantEstimé",
    },
    links: ["claims"],
    blockedBy: ["claims"],
  },
};
type Store = {
  execute(query: string, write?: boolean): Promise<SelectResults>;
};
const appPred = (key: string) => `app:${key}`;
const appLiteral = (v: string) => JSON.stringify(v);
function termValue(
  row: Record<string, { value: string } | undefined>,
  key: string,
) {
  return row[key]?.value;
}
function local(value: string | undefined) {
  if (!value) return undefined;
  if (!value.startsWith(NS))
    throw new AppError(
      409,
      "ONTOLOGY_CONFLICT",
      "RDF relation outside the supported ontology namespace.",
    );
  return value.slice(NS.length);
}
function fields(kind: ResourceKind) {
  return Object.keys(cfg[kind].props)
    .map(
      (key) =>
        `OPTIONAL { ?item ${cfg[kind].props[key]!.startsWith("numéro") ? "a:" + cfg[kind].props[key] : appPred(cfg[kind].props[key]!)} ?${key} }`,
    )
    .join("\n");
}
function projection(kind: ResourceKind) {
  return [
    "name",
    "identifier",
    "email",
    "phone",
    "address",
    "type",
    "status",
    "startDate",
    "endDate",
    "coverage",
    "specialization",
    "availability",
    "description",
    "amount",
  ]
    .map((k) => `?${k}`)
    .join(" ");
}
function querySelect(
  kind: ResourceKind,
  page: number,
  size: number,
  search = "",
  filter = "",
  id?: string,
  sort = "id",
  direction = "asc",
  statusFilter = "",
  typeFilter = "",
) {
  const c = cfg[kind];
  const searchFields =
    kind === "contract"
      ? ',COALESCE(STR(?identifier),""),COALESCE(STR(?type),"")'
      : kind === "insured"
        ? ',COALESCE(STR(?email),""),COALESCE(STR(?phone),"")'
        : ',COALESCE(STR(?type),"")';
  const searchFilter = search
    ? `FILTER(CONTAINS(LCASE(CONCAT(STR(?item)," ",COALESCE(STR(?name),"")${searchFields})),LCASE(${literal(search)})))`
    : "";
  const filterFields =
    kind === "contract"
      ? 'COALESCE(STR(?status),""),COALESCE(STR(?type),"")'
      : kind === "insured"
        ? 'COALESCE(STR(?name),""),COALESCE(STR(?email),"")'
        : kind === "expert"
          ? 'COALESCE(STR(?specialization),""),COALESCE(STR(?availability),"")'
          : 'COALESCE(STR(?type),""),COALESCE(STR(?description),"")';
  const filterBy = [
    filter
      ? `FILTER(CONTAINS(LCASE(CONCAT(${filterFields})),LCASE(${literal(filter)})))`
      : "",
    statusFilter ? `FILTER(STR(?status)=${literal(statusFilter)})` : "",
    typeFilter
      ? `FILTER(CONTAINS(LCASE(STR(?type)),LCASE(${literal(typeFilter)})))`
      : "",
  ].join(" ");
  const order =
    sort === "name"
      ? "?name"
      : sort === "type"
        ? "?type"
        : sort === "status"
          ? "?status"
          : sort === "amount"
            ? "?amount"
            : sort === "startDate"
              ? "?startDate"
              : "?item";
  const claimed =
    kind === "contract"
      ? `OPTIONAL { ?item (a:estSouscritPar|^a:aSouscrit) ?insured } OPTIONAL { ?claim a:concerneContrat ?item }`
      : kind === "insured"
        ? `OPTIONAL { ?item (a:aSouscrit|^a:estSouscritPar) ?contract } OPTIONAL { ?item (a:déclareSinistre|^a:estDéclaréPar) ?claim }`
        : kind === "expert"
          ? `OPTIONAL { ?claim a:évaluéPar ?item }`
          : `OPTIONAL { ?claim a:produitDommage ?item }`;
  return `${prefix} SELECT ?item ${projection(kind)} ?insured ?contract ?claim ?revision WHERE {
 { SELECT DISTINCT ?item WHERE { ?item rdf:type a:${c.className} . FILTER(STRSTARTS(STR(?item),${literal(NS)})) ${id ? `VALUES ?item { ${iri(id)} }` : ""}
 ${fields(kind)} FILTER NOT EXISTS { GRAPH ${`<${APP}metadata>`} { ?item app:deleted true } } ${searchFilter} ${filterBy} }
 ORDER BY ${direction === "desc" ? "DESC" : "ASC"}(${order}) ?item LIMIT ${id ? 1 : size + 1} OFFSET ${id ? 0 : (page - 1) * size} }
 ${fields(kind)} ${claimed} OPTIONAL { GRAPH <${APP}metadata> { ?item app:revision ?revision } }
 } ORDER BY ?item`;
}
function toRecords(
  kind: ResourceKind,
  result: SelectResults,
): ResourceRecord[] {
  const grouped = new Map<
    string,
    Record<string, { value: string } | undefined>[]
  >();
  for (const b of result.results.bindings) {
    const uri = b.item?.value;
    if (!uri) continue;
    grouped.set(uri, [...(grouped.get(uri) ?? []), b]);
  }
  return [...grouped].map(([uri, rows]) => {
    const v = (key: string) => {
      const set = [
        ...new Set(
          rows.map((r) => termValue(r, key)).filter((x): x is string => !!x),
        ),
      ];
      if (set.length > 1)
        throw new AppError(
          409,
          "ONTOLOGY_CONFLICT",
          `Conflicting RDF values for ${local(uri)} (${key}).`,
        );
      return set[0];
    };
    const links = (key: string) => [
      ...new Set(
        rows
          .map((r) => local(termValue(r, key)))
          .filter((x): x is string => !!x),
      ),
    ];
    const revision = v("revision");
    return {
      id: local(uri)!,
      kind,
      name: v("name") ?? local(uri)!,
      identifier: v("identifier"),
      email: v("email"),
      phone: v("phone"),
      address: v("address"),
      type: v("type"),
      status: v("status"),
      startDate: v("startDate"),
      endDate: v("endDate"),
      coverage: v("coverage"),
      specialization: v("specialization"),
      availability: v("availability"),
      description: v("description"),
      amount: v("amount"),
      insuredId: local(v("insured")),
      claimId: undefined,
      contracts: links("contract"),
      claims: links("claim"),
      revision: revision ?? null,
      editable: !!revision,
    };
  });
}
function predicates(kind: ResourceKind, item: string, input: ResourceInput) {
  const c = cfg[kind];
  return Object.entries(c.props)
    .filter(
      ([k]) =>
        k in input &&
        input[k as keyof ResourceInput] !== "" &&
        input[k as keyof ResourceInput] !== undefined,
    )
    .map(([k, p]) => {
      const raw = String(input[k as keyof ResourceInput]);
      const pred = p.startsWith("numéro") ? `a:${p}` : appPred(p);
      const dt =
        k === "amount"
          ? "^^xsd:decimal"
          : k === "startDate" || k === "endDate"
            ? "^^xsd:date"
            : "^^xsd:string";
      return `${item} ${pred} ${appLiteral(raw)}${dt} .`;
    })
    .join("\n");
}
function refGuard(kind: ResourceKind, input: ResourceInput) {
  if (kind === "contract")
    return `${iri(input.insuredId!)} rdf:type a:Assuré . FILTER NOT EXISTS { ${iri(input.insuredId!)} rdf:type a:Expert } FILTER NOT EXISTS { GRAPH <${APP}metadata> { ${iri(input.insuredId!)} app:deleted true } }`;
  if (kind === "damage" && input.claimId)
    return `${iri(input.claimId)} rdf:type a:Sinistre . FILTER NOT EXISTS { ${iri(input.claimId)} rdf:type a:Dommage } FILTER NOT EXISTS { GRAPH <${APP}metadata> { ${iri(input.claimId)} app:deleted true } }`;
  return "";
}
export class ResourcesService {
  constructor(
    private readonly store: Store,
    private readonly enabled: boolean,
  ) {}
  private async select(q: string) {
    return this.store.execute(q);
  }
  async list(kind: ResourceKind, query: unknown) {
    const q = resourceQuery(query);
    const rows = toRecords(
      kind,
      await this.select(
        querySelect(
          kind,
          q.page,
          q.pageSize,
          q.search,
          q.filter,
          undefined,
          q.sort,
          q.direction,
          q.status,
          q.type,
        ),
      ),
    );
    return {
      items: rows.slice(0, q.pageSize),
      page: q.page,
      pageSize: q.pageSize,
      hasMore: rows.length > q.pageSize,
    };
  }
  async get(kind: ResourceKind, id: string) {
    const row = toRecords(
      kind,
      await this.select(querySelect(kind, 1, 1, "", "", id)),
    )[0];
    if (!row)
      throw new AppError(404, "RESOURCE_NOT_FOUND", "Resource not found.");
    return row;
  }
  async options(kind: ResourceKind) {
    const items = toRecords(
      kind,
      await this.select(
        querySelect(kind, 1, 1000, "", "", undefined, "id", "asc"),
      ),
    );
    return {
      items: items.slice(0, 1000).map(({ id, name }) => ({ id, name })),
      truncated: items.length > 1000,
      mutationsEnabled: this.enabled,
    };
  }
  private async collision(id: string) {
    return (
      (
        await this.select(
          `${prefix} SELECT ?found WHERE { {${iri(id)} ?p ?o} UNION {?s ?p ${iri(id)}} UNION {GRAPH ?g {${iri(id)} ?p ?o}} UNION {GRAPH ?g {?s ?p ${iri(id)}}} BIND(true AS ?found) } LIMIT 1`,
        )
      ).results.bindings.length > 0
    );
  }
  private async exists(query: string) {
    return (
      (
        await this.select(
          `${prefix} SELECT ?valid WHERE { ${query} BIND(true AS ?valid) } LIMIT 1`,
        )
      ).results.bindings.length > 0
    );
  }
  private async references(kind: ResourceKind, id: string) {
    const queries: Record<ResourceKind, string> = {
      insured: `${iri(id)} (a:aSouscrit|^a:estSouscritPar|a:déclareSinistre|^a:estDéclaréPar) ?r`,
      contract: `?r a:concerneContrat ${iri(id)}`,
      expert: `?r a:évaluéPar ${iri(id)}`,
      damage: `?r a:produitDommage ${iri(id)}`,
    };
    return this.exists(`${queries[kind]} . FILTER(?r != ${iri(id)})`);
  }
  private async confirm(id: string, revision: string) {
    try {
      const rows = (
        await this.select(
          `${prefix} SELECT ?revision WHERE { GRAPH <${APP}metadata> { ${iri(id)} app:revision ${literal(revision)} FILTER NOT EXISTS { ${iri(id)} app:deleted true } } }`,
        )
      ).results.bindings;
      if (rows.length !== 1)
        throw new AppError(
          409,
          "WRITE_CONFLICT",
          "The update condition failed or the record changed. Reload it.",
        );
    } catch (error) {
      if (error instanceof AppError && error.code === "WRITE_CONFLICT")
        throw error;
      throw new AppError(
        504,
        "MUTATION_OUTCOME_UNKNOWN",
        "The RDF update was sent but its result could not be confirmed. Reload before retrying.",
      );
    }
  }
  async create(kind: ResourceKind, raw: unknown) {
    if (!this.enabled)
      throw new AppError(
        403,
        "MUTATIONS_DISABLED",
        "RDF mutations are disabled.",
      );
    const input = resourceInput(kind, raw);
    if (await this.collision(input.id))
      throw new AppError(
        409,
        "DUPLICATE_IDENTIFIER",
        "This RDF identifier already exists.",
      );
    if (
      kind === "contract" &&
      !(await this.exists(
        `${iri(input.insuredId!)} rdf:type a:Assuré . FILTER NOT EXISTS { GRAPH <${APP}metadata> { ${iri(input.insuredId!)} app:deleted true } } FILTER NOT EXISTS { ${iri(input.insuredId!)} rdf:type a:Expert }`,
      ))
    )
      throw new AppError(
        422,
        "INVALID_REFERENCES",
        "The insured reference does not identify an active insured person.",
      );
    if (
      kind === "contract" &&
      (await this.exists(
        `?other a:numéroContrat ${appLiteral(input.identifier!)} . FILTER(?other != ${iri(input.id)})`,
      ))
    )
      throw new AppError(
        409,
        "DUPLICATE_IDENTIFIER",
        "This contract number is already in use.",
      );
    if (
      kind === "damage" &&
      input.claimId &&
      !(await this.exists(
        `${iri(input.claimId)} rdf:type a:Sinistre . FILTER NOT EXISTS { GRAPH <${APP}metadata> { ${iri(input.claimId)} app:deleted true } }`,
      ))
    )
      throw new AppError(
        422,
        "INVALID_REFERENCES",
        "The claim reference does not exist.",
      );
    const rev = randomUUID(),
      item = iri(input.id),
      c = cfg[kind].className;
    const links =
      kind === "contract"
        ? `${iri(input.insuredId!)} a:aSouscrit ${item} . ${item} a:estSouscritPar ${iri(input.insuredId!)} .`
        : kind === "damage" && input.claimId
          ? `${iri(input.claimId)} a:produitDommage ${item} .`
          : "";
    const update = `${prefix} INSERT { ${item} rdf:type owl:NamedIndividual,a:${c} . ${predicates(kind, item, input)} ${links} GRAPH <${APP}metadata> { ${item} app:revision ${literal(rev)} . } } WHERE { ${refGuard(kind, input)} FILTER NOT EXISTS { ${item} ?p ?o } FILTER NOT EXISTS {?s ?p ${item}} FILTER NOT EXISTS {GRAPH ?g {${item} ?p ?o}} FILTER NOT EXISTS {GRAPH ?g {?s ?p ${item}}} ${kind === "contract" ? `FILTER NOT EXISTS { ?existing a:numéroContrat ${appLiteral(input.identifier!)} }` : ""} }`;
    await this.store.execute(update, true);
    await this.confirm(input.id, rev);
    return { id: input.id, revision: rev };
  }
  async update(kind: ResourceKind, id: string, raw: unknown) {
    if (!this.enabled)
      throw new AppError(
        403,
        "MUTATIONS_DISABLED",
        "RDF mutations are disabled.",
      );
    const current = await this.get(kind, id);
    if (!current.editable)
      throw new AppError(
        403,
        "PROTECTED_RESOURCE",
        "Only application-managed resources can be changed.",
      );
    if (kind === "damage" && raw && typeof raw === "object" && "claimId" in raw)
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Manage damage-to-claim relationships from the claim editor so shared damage links are preserved.",
      );
    const patch = resourceInput(kind, raw, true);
    const { revision: expected } = raw as { revision: string };
    if (current.revision !== expected)
      throw new AppError(
        409,
        "WRITE_CONFLICT",
        "This revision is stale. Reload the record.",
      );
    const values: Record<string, unknown> = { id };
    for (const key of Object.keys(cfg[kind].props))
      values[key] =
        patch[key as keyof ResourceInput] ??
        current[key as keyof ResourceRecord];
    if (kind === "contract")
      values.insuredId = patch.insuredId ?? current.insuredId;
    const input = resourceInput(kind, values);
    const c = cfg[kind].className,
      rev = randomUUID(),
      item = iri(id);
    const props = Object.values(cfg[kind].props).map((p) =>
      p.startsWith("numéro") ? `a:${p}` : appPred(p),
    );
    if (
      kind === "contract" &&
      (await this.exists(
        `?other a:numéroContrat ${appLiteral(input.identifier!)} . FILTER(?other != ${item})`,
      ))
    )
      throw new AppError(
        409,
        "DUPLICATE_IDENTIFIER",
        "This contract number is already in use.",
      );
    const insured = input.insuredId ?? current.insuredId;
    const update = `${prefix} DELETE { ${item} ?p ?o . GRAPH <${APP}metadata> { ${item} app:revision ${literal(expected)} } ${kind === "contract" ? `${current.insuredId ? `${iri(current.insuredId)} a:aSouscrit ${item} .` : ""} ${current.insuredId ? `${item} a:estSouscritPar ${iri(current.insuredId)} .` : ""}` : ""} } INSERT { ${predicates(kind, item, input)} ${kind === "contract" ? `${iri(insured!)} a:aSouscrit ${item} . ${item} a:estSouscritPar ${iri(insured!)} .` : ""} GRAPH <${APP}metadata> { ${item} app:revision ${literal(rev)} } } WHERE { ${item} rdf:type a:${c} . GRAPH <${APP}metadata> { ${item} app:revision ${literal(expected)} } ${kind === "contract" ? `${iri(insured!)} rdf:type a:Assuré . FILTER NOT EXISTS { GRAPH <${APP}metadata> { ${iri(insured!)} app:deleted true } } FILTER NOT EXISTS { ?other a:numéroContrat ${appLiteral(input.identifier!)} . FILTER(?other != ${item}) }` : ""} OPTIONAL { ${item} ?p ?o . FILTER(?p IN (${props.join(",")})) } }`;
    await this.store.execute(update, true);
    await this.confirm(id, rev);
    return { id, revision: rev };
  }
  async delete(kind: ResourceKind, id: string, expected: string) {
    if (!this.enabled)
      throw new AppError(
        403,
        "MUTATIONS_DISABLED",
        "RDF mutations are disabled.",
      );
    const current = await this.get(kind, id);
    if (!current.editable)
      throw new AppError(
        403,
        "PROTECTED_RESOURCE",
        "Original ontology individuals are read-only.",
      );
    if (current.revision !== expected)
      throw new AppError(
        409,
        "WRITE_CONFLICT",
        "This revision is stale. Reload the record.",
      );
    if (await this.references(kind, id))
      throw new AppError(
        409,
        "RESOURCE_REFERENCED",
        "This record is used by another resource and cannot be deleted.",
      );
    const rev = randomUUID();
    const contractRelations =
      kind === "contract"
        ? `?insured a:aSouscrit ${iri(id)} . ${iri(id)} a:estSouscritPar ?insured .`
        : "";
    const inboundGuard =
      kind === "contract"
        ? `FILTER NOT EXISTS { ?r ?p ${iri(id)} . FILTER(?r != ${iri(id)} && ?p != a:aSouscrit && ?p != a:estSouscritPar) }`
        : `FILTER NOT EXISTS { ?r ?p ${iri(id)} . FILTER(?r != ${iri(id)}) }`;
    await this.store.execute(
      `${prefix} DELETE { GRAPH <${APP}metadata> { ${iri(id)} app:revision ${literal(expected)} } ${kind === "contract" ? `?insured a:aSouscrit ${iri(id)} . ${iri(id)} a:estSouscritPar ?insured .` : ""} } INSERT { GRAPH <${APP}metadata> { ${iri(id)} app:revision ${literal(rev)};app:deleted true } } WHERE { GRAPH <${APP}metadata> { ${iri(id)} app:revision ${literal(expected)} FILTER NOT EXISTS {${iri(id)} app:deleted true} } OPTIONAL { ${contractRelations} } ${kind === "contract" ? `FILTER NOT EXISTS { ?other a:aSouscrit ${iri(id)} . FILTER(?other != ?insured) }` : ""} ${inboundGuard} }`,
      true,
    );
    const check = (
      await this.select(
        `${prefix} SELECT ?deleted WHERE { GRAPH <${APP}metadata> { ${iri(id)} app:deleted true;app:revision ${literal(rev)} } }`,
      )
    ).results.bindings;
    if (check.length !== 1)
      throw new AppError(
        409,
        "WRITE_CONFLICT",
        "The deletion condition failed. Reload the record.",
      );
    return { id, deleted: true };
  }
}
