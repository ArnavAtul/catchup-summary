// Demo fallback analyzer: rule-based, NOT AI. Every item is a verbatim line
// from the source conversation, so nothing is invented.
export type Item = { text: string; author?: string };
export type Analysis = {
  updates: Item[];
  urgent: Item[];
  deadlines: Item[];
  decisions: Item[];
  mentions: Item[];
};

const RULES: Record<keyof Analysis, RegExp> = {
  urgent: /\b(urgent|asap|immediately|blocker|blocking|critical|right away|today)\b/i,
  deadlines:
    /\b(due|deadline|by (mon|tue|wed|thu|fri|sat|sun|tomorrow|tonight|eod|end of|\d))|\b(eod|eow)\b/i,
  decisions: /\b(decided|agreed|we('| a)re going with|final call|approved|let's go with)\b/i,
  mentions: /@\w+/,
  updates: /\b(update|fyi|heads up|announce|shipped|launched|released|moved|changed|new)\b/i,
};

export function demoAnalyze(conversation: string): Analysis {
  const out: Analysis = { updates: [], urgent: [], deadlines: [], decisions: [], mentions: [] };
  for (const raw of conversation.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^\[?[^\]]*\]?\s*([^:]{1,30}):\s*(.+)$/);
    const item: Item = m && m[1] && m[2] ? { author: m[1].trim(), text: m[2].trim() } : { text: line };
    (Object.keys(RULES) as (keyof Analysis)[]).forEach((k) => {
      if (RULES[k].test(item.text)) out[k].push(item);
    });
  }
  return out;
}

export const isEmpty = (a: Analysis) => Object.values(a).every((v) => v.length === 0);
