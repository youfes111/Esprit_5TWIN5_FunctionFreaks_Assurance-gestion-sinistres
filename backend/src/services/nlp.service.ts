import { questionInput } from "../validators/nlp.js";
import { preprocess } from "../nlp/preprocess.js";
import { checkLanguage, planQuestion } from "../nlp/planner.js";
import { catalogFromResults, recognizeEntities } from "../nlp/entities.js";
import { buildNlpQuery } from "../nlp/queries.js";
import { formatResults } from "../nlp/format.js";
import type { NlpReader, NlpAnswer } from "../nlp/types.js";

export const nlpExamples = [
  "Liste tous les sinistres.",
  "Quels sinistres sont évalués par Karim ?",
  "Montre-moi le sinistre S2026_014.",
  "Quels sont les contrats d’assurance ?",
  "Liste les assurés.",
  "Combien de sinistres existent ?",
  "Quels sont les sinistres évalués par l’expert Karim ?",
  "Liste les sinistres du contrat AUTO_882.",
  "Quels sinistres sont déclarés par Leila ?",
];
export class NlpService {
  constructor(private readonly reader: NlpReader) {}
  async ask(body: unknown): Promise<NlpAnswer> {
    const question = questionInput(body);
    checkLanguage(question);
    const preprocessing = preprocess(question);
    const catalog = catalogFromResults(await this.reader.nlpEntities());
    const { entities, remainder } = recognizeEntities(
      preprocessing.normalized,
      catalog,
    );
    const { plan, rule } = planQuestion(remainder, entities);
    const sparql = buildNlpQuery(plan);
    const result = await this.reader.selectNlp(plan);
    return {
      question,
      intent: plan.intent,
      entities,
      preprocessing,
      plan,
      sparql,
      rule,
      ...formatResults(plan, result),
    };
  }
}
