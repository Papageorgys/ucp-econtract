"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, api, loadSession, saveSession } from "@/lib/client";
import type { Journey } from "@/lib/types";

const JOURNEYS: Array<{ id: Journey; title: string; detail: string }> = [
  { id: "electricity", title: "Ρεύμα", detail: "Electricity supply only. Needs a supply point number." },
  { id: "fiber", title: "Ίντερνετ", detail: "Fiber only. Needs an address with coverage." },
  { id: "bundle", title: "Ρεύμα + Ίντερνετ", detail: "Bundle. Downgrades to electricity if the address has no coverage." },
];

export default function Home() {
  const router = useRouter();
  const [busy, setBusy] = useState<Journey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resume, setResume] = useState<{ id: string; token: string } | null>(null);

  useEffect(() => setResume(loadSession()), []);

  async function start(journey: Journey) {
    setBusy(journey);
    setError(null);
    try {
      const created = await api.createApplication(journey);
      saveSession(created.id, created.token);
      router.push(`/application/${created.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? `${e.message} (${e.status})` : String(e));
      setBusy(null);
    }
  }

  return (
    <main className="wrap">
      <h1 className="h1">Νέα αίτηση</h1>
      <p className="lead">
        Prototype frontend. Every call goes to this origin and is relayed server-side to the Supabase Edge
        Functions — the browser holds only the per-application bearer token.
      </p>

      {error && <div className="alert err">{error}</div>}

      {resume && (
        <div className="card">
          <h2 className="h2">Συνέχεια</h2>
          <p className="small muted">
            Open application <span className="mono">{resume.id}</span> in this browser session.
          </p>
          <div className="row">
            <button className="btn ghost" onClick={() => router.push(`/application/${resume.id}`)}>
              Continue
            </button>
          </div>
        </div>
      )}

      <div className="grid">
        {JOURNEYS.map((j) => (
          <div className="card" key={j.id}>
            <h2 className="h2">{j.title}</h2>
            <p className="small muted">{j.detail}</p>
            <div className="row">
              <button className="btn" disabled={busy !== null} onClick={() => start(j.id)}>
                {busy === j.id ? "…" : "Ξεκινάμε"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
