import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { analyzeConversation } from "@/lib/catchup.functions";
import { isEmpty, groupFacts, type Analysis, type Category, type Item } from "@/lib/analyze";
import { SAMPLES } from "@/lib/samples";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CatchUp AI — What Did I Miss?" },
      { name: "description", content: "Paste a conversation and get updates, tasks, deadlines, decisions and mentions." },
      { property: "og:title", content: "CatchUp AI — What Did I Miss?" },
      { property: "og:description", content: "Catch up on unread conversations in seconds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const SECTIONS: { key: keyof Analysis; label: string }[] = [
  { key: "updates", label: "Important Updates" },
  { key: "urgent", label: "Tasks & Action Items" },
  { key: "deadlines", label: "Deadlines" },
  { key: "decisions", label: "Decisions" },
  { key: "mentions", label: "Mentions" },
  { key: "events", label: "Scheduled Events" },
];

type Convo = {
  id: string; title: string; body: string; is_sample: boolean; status: string; error: string | null; created_at: string;
};

function Index() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (!ready) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  return session ? <Dashboard email={session.user.email ?? ""} /> : <SignIn />;
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg("");
    const { data, error } = mode === "in"
      ? await supabase.auth.signInWithPassword({ email, password: pw })
      : await supabase.auth.signUp({ email, password: pw, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (error) setMsg(error.message);
    else if (mode === "up" && !data.session) setMsg("Check your email to confirm your account, then sign in.");
  };
  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) setMsg(r.error.message);
  };
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <form onSubmit={submit} className="card-surface p-8 w-full max-w-sm space-y-4">
        <h1 className="font-display text-4xl">CatchUp<span className="text-primary">.</span></h1>
        <p className="text-sm text-muted-foreground">Sign in so your conversations stay private to you.</p>
        <input className="field" type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="field" type="password" required minLength={6} placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}</button>
        <button type="button" onClick={google} className="chip w-full py-2">Continue with Google</button>
        {msg && <p className="text-sm text-destructive">{msg}</p>}
        <button type="button" className="text-xs underline text-muted-foreground" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "No account? Sign up" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}

async function loadResult(conversationId: string) {
  const { data: s, error } = await supabase.from("summaries").select("id, model").eq("conversation_id", conversationId).maybeSingle();
  if (error) throw error;
  if (!s) return null;
  const { data: items, error: e2 } = await supabase.from("action_items").select("category, categories, text, author").eq("summary_id", s.id);
  if (e2) throw e2;
  const facts = (items ?? []).map((i) => ({
    quote: i.text, author: i.author ?? undefined,
    categories: (i.categories?.length ? i.categories : [i.category]) as Category[],
  }));
  return { analysis: groupFacts(facts), model: s.model, total: facts.length };
}

function Dashboard({ email }: { email: string }) {
  const qc = useQueryClient();
  const analyze = useServerFn(analyzeConversation);
  const [text, setText] = useState("");
  const [sample, setSample] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const history = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("conversations").select("*").order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return data as Convo[];
    },
  });
  const result = useQuery({
    queryKey: ["result", selected],
    enabled: !!selected,
    queryFn: () => loadResult(selected!),
  });
  const current = history.data?.find((c) => c.id === selected);

  const runAnalysis = async (id: string) => {
    setBusy(true); setError(""); setOk("");
    try {
      await analyze({ data: { conversationId: id } });
      setOk("Analyzed and saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setBusy(false);
      await qc.invalidateQueries({ queryKey: ["conversations"] });
      await qc.invalidateQueries({ queryKey: ["result", id] });
    }
  };

  const submit = async () => {
    if (!text.trim()) { setError("Paste a conversation first."); return; }
    setBusy(true); setError(""); setOk("");
    const title = sample ?? (text.trim().split("\n")[0] ?? "").slice(0, 40);
    const { data, error } = await supabase.from("conversations")
      .insert({ body: text, title, is_sample: !!sample }).select("id").single();
    if (error || !data) { setBusy(false); setError("Could not save conversation: " + (error?.message ?? "unknown")); return; }
    setSelected(data.id);
    await runAnalysis(data.id);
  };

  const a = result.data?.analysis ?? null;

  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-sidebar text-sidebar-foreground md:w-72 md:min-h-screen p-6 flex flex-col gap-6">
        <div>
          <h1 className="font-display text-3xl leading-none">CatchUp<span className="text-sidebar-primary">.</span></h1>
          <p className="text-xs opacity-70 mt-1">What did I miss?</p>
        </div>
        <button className="badge-status self-start" onClick={() => { setSelected(null); setText(""); setSample(null); setOk(""); setError(""); }}>+ New catch-up</button>
        <div className="space-y-2 text-sm flex-1">
          <p className="uppercase tracking-widest text-[10px] opacity-60">Saved history</p>
          {history.isLoading && <p className="opacity-70">Loading…</p>}
          {history.isError && <p className="opacity-70">Couldn't load history. <button className="underline" onClick={() => history.refetch()}>Retry</button></p>}
          {history.data?.length === 0 && <p className="opacity-70">No saved conversations yet.</p>}
          {history.data?.map((c) => (
            <button key={c.id} onClick={() => { setSelected(c.id); setText(c.body); setSample(c.is_sample ? c.title : null); setError(c.error ?? ""); setOk(""); }}
              className={`history-item ${selected === c.id ? "history-item-active" : ""}`}>
              <span className="truncate">{c.title}</span>
              <span className="text-[10px] opacity-70">{c.is_sample ? "Sample" : "Yours"} · {c.status === "error" ? "Failed" : c.status === "done" ? "Done" : "Pending"}</span>
            </button>
          ))}
        </div>
        <div className="text-xs opacity-70 space-y-1">
          <p className="truncate">{email}</p>
          <button className="underline" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </aside>

      <main className="flex-1 p-6 md:p-10 max-w-6xl space-y-8">
        <header>
          <h2 className="font-display text-4xl md:text-5xl">What did I miss?</h2>
          <p className="text-muted-foreground mt-2">Paste a conversation and get the important bits.</p>
        </header>

        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {SECTIONS.map((s) => (
            <div key={s.key} className="card-surface p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="font-display text-3xl">{a ? a[s.key].length : "–"}</p>
            </div>
          ))}
        </section>

        {a && <p className="text-xs text-muted-foreground -mt-5">{result.data?.total} unique facts found · a statement in two sections is still one fact.</p>}

        <section className="card-surface p-5 space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground">Try sample data:</span>
            {SAMPLES.map((s) => (
              <button key={s.title} onClick={() => { setSelected(null); setText(s.body); setSample(`Sample · ${s.title}`); }} className="chip">
                Sample · {s.title}
              </button>
            ))}
            {sample && <span className="badge-status">Sample conversation</span>}
          </div>
          <textarea value={text} onChange={(e) => { setText(e.target.value); if (selected) setSelected(null); }} rows={8}
            placeholder={"Name: message\nName: message…"} className="field font-mono" />
          <div className="flex flex-wrap items-center gap-4">
            <button onClick={submit} disabled={busy} className="btn-primary">{busy ? "Catching up…" : "Catch me up"}</button>
            {error && (
              <p className="text-sm text-destructive">
                {error}{" "}
                {current && current.status !== "done" && <button className="underline" onClick={() => runAnalysis(current.id)}>Retry analysis</button>}
              </p>
            )}
            {ok && <p className="text-sm text-success">{ok}</p>}
          </div>
          <p className="text-xs text-muted-foreground border-t border-border pt-3">
            <strong>Privacy:</strong> Conversations you submit are sent to our server, analyzed by an AI model, and stored in
            our database linked to your account. Only you can see them. Avoid pasting passwords or sensitive personal data.
          </p>
        </section>

        {selected && result.isLoading && <p className="text-muted-foreground">Loading saved result…</p>}
        {selected && result.isError && <p className="text-destructive">Couldn't load result. <button className="underline" onClick={() => result.refetch()}>Retry</button></p>}
        {a && (
          <section className="space-y-4">
            <div className="notice">
              {result.data?.model === "demo-keyword"
                ? <><strong>Demo fallback — not AI.</strong> Keyword matching was used because AI isn't configured.</>
                : <><strong>AI summary</strong> by {result.data?.model}. Items come only from the conversation, but double-check anything important.</>}
            </div>
            {isEmpty(a) ? (
              <p className="card-surface p-6 text-muted-foreground">Nothing important found. You're all caught up.</p>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {SECTIONS.map((s) => <ResultCard key={s.key} label={s.label} items={a[s.key]} />)}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function ResultCard({ label, items }: { label: string; items: Item[] }) {
  return (
    <div className="card-surface p-5">
      <h3 className="font-display text-2xl mb-3">{label}</h3>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">None found.</p> : (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={i} className="text-sm border-l-2 border-primary pl-3">
              {it.author && <span className="font-semibold">{it.author}: </span>}{it.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
