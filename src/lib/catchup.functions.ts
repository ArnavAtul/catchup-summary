import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CATEGORIES, demoFacts, validateFacts, type Fact } from "./analyze";

const MODEL = "openai/gpt-6-astra";

const schema = {
  type: "object",
  properties: {
    facts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          quote: { type: "string" },
          author: { type: ["string", "null"] },
          categories: { type: "array", items: { type: "string", enum: [...CATEGORIES] } },
        },
        required: ["quote", "author", "categories"],
        additionalProperties: false,
      },
    },
  },
  required: ["facts"],
  additionalProperties: false,
};

export const INSTRUCTIONS = `Extract the important facts from a chat conversation for someone catching up.
Each fact is ONE statement copied VERBATIM from a message (the quote, without the "Name:" prefix).
List each underlying statement only once; if it fits several categories, give all of them in "categories".
Categories (use only when clearly true):
- deadlines: work that must be done by a specific date/time ("by Friday", "due Monday 10 AM").
- events: a scheduled meeting/review/call at a time, with no deliverable due.
- decisions: ONLY explicit decisions/agreements ("decided", "agreed", "going with"). Plans, tasks and opinions are NOT decisions.
- urgent: tasks or action items someone needs to do (including "X needs testing"), with or without a date.
- mentions: only explicit @-mentions of a person.
- updates: important news/status changes that are not tasks, deadlines, decisions or events.
Rules: never invent or paraphrase; keep original names and wording; skip small talk; author = speaker name or null.`;

async function aiFacts(body: string, apiKey: string): Promise<Fact[]> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      Authorization: `Bearer ${apiKey}`,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      instructions: INSTRUCTIONS,
      input: [{ role: "user", content: body }],
      text: { format: { type: "json_schema", name: "catchup_facts", strict: true, schema } },
    }),
  });
  if (!res.ok || !res.body) {
    const msg = await res.text().catch(() => "");
    if (res.status === 402) throw new Error("AI credits are used up. Add credits in workspace settings.");
    if (res.status === 429) throw new Error("AI is busy right now. Please retry in a moment.");
    throw new Error(`AI request failed (${res.status}). ${msg.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const l of lines) {
      if (!l.startsWith("data:")) continue;
      const d = l.slice(5).trim();
      if (!d || d === "[DONE]") continue;
      let ev: { type?: string; delta?: string; error?: { message?: string }; response?: { error?: { message?: string } } };
      try { ev = JSON.parse(d); } catch { continue; }
      if (ev.type === "response.output_text.delta") out += ev.delta ?? "";
      if (ev.type === "response.failed" || ev.type === "error")
        throw new Error(ev.error?.message ?? ev.response?.error?.message ?? "AI failed");
    }
  }
  if (!out) throw new Error("The AI returned no result.");
  const parsed = JSON.parse(out) as { facts: { quote: string; author: string | null; categories: Fact["categories"] }[] };
  return parsed.facts.map((f) => ({ quote: f.quote, author: f.author ?? undefined, categories: f.categories }));
}

export const analyzeConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: convo, error } = await supabase
      .from("conversations").select("id, body").eq("id", data.conversationId).single();
    if (error || !convo) throw new Error("Conversation not found.");

    const apiKey = process.env["LOVABLE_API_KEY"];
    let facts: Fact[];
    let model = MODEL;
    try {
      if (apiKey) facts = await aiFacts(convo.body, apiKey);
      else { facts = demoFacts(convo.body); model = "demo-keyword"; }
      // Drop anything not literally in the source and merge duplicates.
      facts = validateFacts(facts, convo.body);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Analysis failed.";
      await supabase.from("conversations").update({ status: "error", error: msg }).eq("id", convo.id);
      throw new Error(msg);
    }

    await supabase.from("summaries").delete().eq("conversation_id", convo.id);
    const { data: summary, error: sErr } = await supabase
      .from("summaries").insert({ conversation_id: convo.id, model }).select("id").single();
    if (sErr || !summary) throw new Error("Could not save summary: " + sErr?.message);
    // One row per underlying fact; extra categories stored alongside.
    const rows = facts.map((f) => ({
      summary_id: summary.id, category: f.categories[0]!, categories: f.categories, text: f.quote, author: f.author ?? null,
    }));
    if (rows.length) {
      const { error: iErr } = await supabase.from("action_items").insert(rows);
      if (iErr) throw new Error("Could not save items: " + iErr.message);
    }
    await supabase.from("conversations").update({ status: "done", error: null }).eq("id", convo.id);
    return { model, facts: facts.length };
  });
