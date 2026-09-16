"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, agentApi } from "@/lib/client";
import type { QueueRow } from "@/lib/types";

export default function AgentPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { applications } = await agentApi.queue();
      setRows(applications);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? `${e.message} (${e.status})` : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void agentApi.session().then(({ agent }) => setAuthed(agent));
  }, []);

  useEffect(() => {
    if (authed) void load();
  }, [authed, load]);

  if (authed === null) {
    return (
      <main className="wrap">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (!authed) {
    return <Login onAuthed={() => setAuthed(true)} />;
  }

  return (
    <main className="wrap wide">
      <h1 className="h1">Ουρά αιτήσεων</h1>
      <p className="lead">
        This console never holds the upstream agent token. The browser carries an httpOnly session cookie; the
        proxy route attaches <span className="mono">x-agent-token</span> server-side.
      </p>

      {error && <div className="alert err">{error}</div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Application</th>
              <th>Created</th>
              <th>Journey</th>
              <th>State</th>
              <th>Signatory</th>
              <th>Route</th>
              <th>Documents</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.id}</td>
                <td className="mono">{r.created_at.slice(0, 10)}</td>
                <td>{r.journey}</td>
                <td>
                  <span className="pill brand">{r.state}</span>
                </td>
                <td>{r.kyc?.name ?? "—"}</td>
                <td>
                  <span className={`pill ${r.kyc?.method === "manual" ? "warn" : ""}`}>{r.kyc?.method ?? "—"}</span>
                </td>
                <td>
                  {r.docs.length === 0 && <span className="faint">—</span>}
                  {r.docs.map((d, i) => (
                    <span
                      key={`${d.doc_type}-${i}`}
                      className={`pill ${d.status === "approved" ? "ok" : d.status === "rejected" ? "err" : "warn"}`}
                      style={{ marginRight: 6 }}
                    >
                      {d.doc_type}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="faint">
                  Queue is empty.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="row">
        <button className="btn ghost" onClick={load} disabled={loading}>
          Ανανέωση
        </button>
        <button
          className="btn ghost"
          onClick={async () => {
            await agentApi.logout();
            setAuthed(false);
            setRows(null);
          }}
        >
          Έξοδος
        </button>
      </div>
    </main>
  );
}

function Login({ onAuthed }: { onAuthed: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await agentApi.login(password);
      onAuthed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <h1 className="h1">Agent console</h1>
      <p className="lead">
        A single shared password gating a single shared upstream token. Adequate for a prototype, not for
        attribution — see the caveat in <span className="mono">web/README.md</span>.
      </p>
      <form className="card" onSubmit={submit}>
        {error && <div className="alert err">{error}</div>}
        <div className="field">
          <label htmlFor="pw">Κωδικός</label>
          <input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </div>
        <div className="row">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "…" : "Είσοδος"}
          </button>
        </div>
      </form>
    </main>
  );
}
