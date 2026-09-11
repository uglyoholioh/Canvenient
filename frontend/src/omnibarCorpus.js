// The omnibar searches the whole notes+tasks corpus client-side, so refetching
// both on every keystroke would hammer the backend. The corpus is cached for a
// short window and invalidated when tasks change elsewhere in the app.

import { getNotes, getTasks } from "./api";

export const CORPUS_TTL_MS = 30_000;
let corpusCache = null;

export function invalidateOmnibarCorpus() {
  corpusCache = null;
}

export async function loadCorpus(token) {
  if (corpusCache && corpusCache.token === token && Date.now() - corpusCache.fetchedAt < CORPUS_TTL_MS) {
    return corpusCache;
  }
  const [notes, tasks] = await Promise.all([getNotes(token), getTasks(token)]);
  corpusCache = { token, notes, tasks, fetchedAt: Date.now() };
  return corpusCache;
}
