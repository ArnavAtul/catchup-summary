import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { demoAnalyze, isEmpty, type Analysis, type Item } from "@/lib/analyze";
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
  { key: "urgent", label: "Urgent Tasks" },
  { key: "deadlines", label: "Deadlines" },
  { key: "decisions", label: "Decisions" },
  { key: "mentions", label: "Mentions" },
];

type Status = "idle" | "loading" | "success" | "error";

function Index() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<Analysis | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const run = async () => {
    if (!text.trim()) {
      setStatus("error");
      setError("Paste a conversation first.");
      return;
    }
    setStatus("loading");
    try {
      await new Promise((r) => setTimeout(r, 400));
      setResult(demoAnalyze(text));
      setStatus("success");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-sidebar text-sidebar-foreground md:w-64 md:min-h-screen p-6 flex md:flex-col gap-6 justify-between">
        <div>
          <h1 className="font-display text-3xl leading-none">CatchUp<span className="text-sidebar-primary">.</span></h1>
          <p className="text-xs opacity-70 mt-1">What did I miss?</p>
        </div>
        <div className="hidden md:block space-y-3 text-sm">
          <p className="uppercase tracking-widest text-[10px] opacity-60">Saved history</p>
          <p className="opacity-70">Database not connected yet. Nothing is being saved.</p>
        </div>
        <span className="badge-status self-start md:self-auto">Demo mode</span>
      </aside>

      <main className="flex-1 p-6 md:p-10 max-w-6xl space-y-8">
        <header>
          <h2 className="font-display text-4xl md:text-5xl">What did I miss?</h2>
          <p className="text-muted-foreground mt-2">Paste a conversation and get the important bits.</p>
        </header>

        <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {SECTIONS.map((s) => (
            <div key={s.key} className="card-surface p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="font-display text-3xl">{result ? result[s.key].length : "–"}</p>
            </div>
          ))}
        </section>

        <section className="card-surface p-5 space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground">Try sample data:</span>
            {SAMPLES.map((s) => (
              <button key={s.title} onClick={() => setText(s.body)} className="chip">
                Sample · {s.title}
              </button>
            ))}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={"Name: message\nName: message…"}
            className="w-full rounded-md border border-input bg-background p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex flex-wrap items-center gap-4">
            <button onClick={run} disabled={status === "loading"} className="btn-primary">
              {status === "loading" ? "Catching up…" : "Catch me up"}
            </button>
            {status === "error" && <p className="text-sm text-destructive">{error}</p>}
            {status === "success" && <p className="text-sm text-success">Summary ready.</p>}
          </div>
          <p className="text-xs text-muted-foreground border-t border-border pt-3">
            <strong>Privacy:</strong> In demo mode, analysis runs in your browser and nothing is saved. Once the
            database and AI are connected, pasted conversations will be sent to our server and stored there. Avoid
            pasting passwords or sensitive personal data.
          </p>
        </section>

        {result && (
          <section className="space-y-4">
            <div className="notice">
              <strong>Demo fallback — not AI.</strong> Results come from simple keyword matching and only quote lines
              from your conversation.
            </div>
            {isEmpty(result) ? (
              <p className="card-surface p-6 text-muted-foreground">Nothing important found. You're all caught up.</p>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {SECTIONS.map((s) => (
                  <ResultCard key={s.key} label={s.label} items={result[s.key]} />
                ))}
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
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None found.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={i} className="text-sm border-l-2 border-primary pl-3">
              {it.author && <span className="font-semibold">{it.author}: </span>}
              {it.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
