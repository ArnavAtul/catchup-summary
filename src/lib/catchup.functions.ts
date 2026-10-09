import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { demoAnalyze, type Analysis } from "./analyze";

const MODEL = "openai/gpt-6-astra";
const KEYS = ["updates", "urgent", "deadlines", "decisions", "mentions"] as const;

const itemSchema = {
  type: "array",
  items: {
    type: "object",
    properties: { text: { type: "string" }, author: { type: ["string", "null"] } },
    required: ["text", "author"],
    additionalProperties: false,
  },
};
const schema = {
  type: "object",
  properties: Object.fromEntries(KEYS.map((k) => [k, itemSchema])),
  required: [...KEYS],
  additionalProperties: false,
};

const INSTRUCTIONS = `You summarize a chat conversation for someone catching up.
Return items in five categories: updates (important news), urgent (tasks needing fast action),
deadlines (anything with a due date/time), decisions (things agreed or decided), mentions (@-mentions of people).
STRICT RULES: Only use information explicitly present in the conversation. Never invent tasks, dates,
decisions or people. If a category has nothing, return an empty array. Keep each item one short sentence,
include the speaker as author when known, otherwise null. Ignore small talk.`;

async function aiAnalyze(body: string, apiKey: string): Promise<Analysis> {
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
      text: { format: { type: "json_schema", name: "catchup", strict: true, schema } },
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
      try {
        const ev = JSON.parse(d);
        if (ev.type === "response.output_text.delta") out += ev.delta;
        if (ev.type === "response.failed" || ev.type === "error")
          throw new Error(ev.error?.message ?? ev.response?.error?.message ?? "AI failed");
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
  if (!out) throw new Error("The AI returned no result.");
  const parsed = JSON.parse(out) as Record<string, { text: string; author: string | null }[]>;
  return Object.fromEntries(
    KEYS.map((k) => [k, (parsed[k] ?? []).map((i) => ({ text: i.text, author: i.author ?? undefined }))]),
  ) as Analysis;
}

export const analyzeConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: convo, error } = await supabase
      .from("conversations")
      .select("id, body")
      .eq("id", data.conversationId)
      .single();
    if (error || !convo) throw new Error("Conversation not found.");

    const apiKey = process.env["LOVABLE_API_KEY"];
    let analysis: Analysis;
    let model = MODEL;
    try {
      if (apiKey) analysis = await aiAnalyze(convo.body, apiKey);
      else {
        analysis = demoAnalyze(convo.body);
        model = "demo-keyword";
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Analysis failed.";
      await supabase.from("conversations").update({ status: "error", error: msg }).eq("id", convo.id);
      throw new Error(msg);
    }

    await supabase.from("summaries").delete().eq("conversation_id", convo.id);
    const { data: summary, error: sErr } = await supabase
      .from("summaries")
      .insert({ conversation_id: convo.id, model })
      .select("id")
      .single();
    if (sErr || !summary) throw new Error("Could not save summary: " + sErr?.message);
    const rows = KEYS.flatMap((k) =>
      analysis[k].map((i) => ({ summary_id: summary.id, category: k, text: i.text, author: i.author ?? null })),
    );
    if (rows.length) {
      const { error: iErr } = await supabase.from("action_items").insert(rows);
      if (iErr) throw new Error("Could not save items: " + iErr.message);
    }
    await supabase.from("conversations").update({ status: "done", error: null }).eq("id", convo.id);
    return { model };
  });
