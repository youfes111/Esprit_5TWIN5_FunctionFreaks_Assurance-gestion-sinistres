import { createRequire } from "node:module";
import type { AggressiveTokenizerFr, Stemmer } from "natural";
// Load only the two linguistic modules, never natural's optional database adapters.
const require = createRequire(import.meta.url);
const FrenchTokenizer =
  require("natural/lib/natural/tokenizers/aggressive_tokenizer_fr.js") as new () => AggressiveTokenizerFr;
const stemmer =
  require("natural/lib/natural/stemmers/porter_stemmer_fr.js") as Stemmer;
const tokenizer = new FrenchTokenizer();

export function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("fr")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^\p{L}\p{N}_]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
}
export function stem(token: string): string {
  return fold(stemmer.stem(token));
}
export function preprocess(text: string) {
  const normalized = normalize(text);
  const tokens = tokenizer.tokenize(normalized);
  return { normalized, tokens, stems: tokens.map(stem) };
}
export function lexicon(words: string): Set<string> {
  return new Set([
    ...preprocess(words).stems,
    ...preprocess(fold(words)).stems,
  ]);
}
