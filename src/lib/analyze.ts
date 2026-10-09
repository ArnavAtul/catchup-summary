// Shared types + demo fallback analyzer (rule-based, NOT AI).
// A "fact" is one source statement; it may belong to several categories but
// is counted once per category and once overall.
export const CATEGORIES = ["updates", "urgent", "deadlines", "decisions", "mentions", "events"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Fact = { quote: string; author?: string | undefined; categories: Category[] };
export type Item = { text: string; author?: string | undefined };
export type Analysis = Record<Category, Item[]>;

const DAY = "(mon|tues|wednes|thurs|fri|satur|sun)day|tomorrow|tonight|eod|end of (day|week|month)|\\d{1,2}(:\\d{2})?\\s?(am|pm)|\\d{1,2}(st|nd|rd|th)?\\s(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\\w*\\s\\d{1,2}";
const RX = {
  deadline: new RegExp(`\\b(by|due|before|deadline|no later than)\\b[^.]*\\b(${DAY})`, "i"),
  event: new RegExp(`\\b(meeting|review|call|sync|standup|demo|kickoff|session|catch[- ]?up)\\b[^.]*\\b(on|at|this|next)?\\s*(${DAY})|\\b(${DAY})\\b[^.]*\\b(meeting|review|call|sync|standup|demo|kickoff)\\b`, "i"),
  decision: /\b(decided|agreed|we('re| are) going with|final(ised|ized)? (call|decision)|approved|settled on|let's go with)\b/i,
  task: /\b(needs? (to|testing|review|fixing)|must|have to|has to|should|please|can you|could you|todo|to-do|will (finish|submit|send|fix|write|test|review|update|complete)|asap|urgent|blocker)\b/i,
  mention: /@\w+/,
  update: /\b(fyi|heads up|shipped|launched|released|moved|changed|announced?|is (now )?live|update:)\b/i,
};

export function classify(text: string): Category[] {
  const c: Category[] = [];
  const isDecision = RX.decision.test(text);
  if (isDecision) c.push("decisions");
  if (RX.deadline.test(text)) c.push("deadlines");
  else if (RX.event.test(text)) c.push("events");
  if (!isDecision && RX.task.test(text)) c.push("urgent");
  if (RX.mention.test(text)) c.push("mentions");
  if (c.length === 0 && RX.update.test(text)) c.push("updates");
  return c;
}

export function splitLine(raw: string): { author?: string; text: string } {
  const m = raw.trim().match(/^(?:\[[^\]]*\]\s*)?([A-Za-z][\w .'-]{0,29}):\s*(.+)$/);
  return m && m[1] && m[2] ? { author: m[1].trim(), text: m[2].trim() } : { text: raw.trim() };
}

export function demoFacts(conversation: string): Fact[] {
  const facts: Fact[] = [];
  const seen = new Set<string>();
  for (const raw of conversation.split("\n")) {
    if (!raw.trim()) continue;
    const { author, text } = splitLine(raw);
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      const key = norm(sentence);
      if (!key || seen.has(key)) continue;
      const categories = classify(sentence);
      if (categories.length) { seen.add(key); facts.push({ quote: sentence, author, categories }); }
    }
  }
  return facts;
}

export const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}@]+/gu, " ").trim();

/** Keep only facts whose quote really appears in the source; merge duplicates. */
export function validateFacts(facts: Fact[], source: string): Fact[] {
  const src = norm(source);
  const byKey = new Map<string, Fact>();
  for (const f of facts) {
    const key = norm(f.quote);
    if (!key || !src.includes(key)) continue;
    const cats = f.categories.filter((c): c is Category => (CATEGORIES as readonly string[]).includes(c));
    if (!cats.length) continue;
    const prev = byKey.get(key);
    if (prev) prev.categories = [...new Set([...prev.categories, ...cats])];
    else byKey.set(key, { ...f, categories: [...new Set(cats)] });
  }
  return [...byKey.values()];
}

export function groupFacts(facts: Fact[]): Analysis {
  const a = Object.fromEntries(CATEGORIES.map((c) => [c, [] as Item[]])) as Analysis;
  for (const f of facts) for (const c of f.categories) a[c].push({ text: f.quote, author: f.author });
  return a;
}

export const demoAnalyze = (conversation: string) => groupFacts(demoFacts(conversation));
export const isEmpty = (a: Analysis) => Object.values(a).every((v) => v.length === 0);
