"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, api, clearSession, loadSession } from "@/lib/client";
import type { ApplicationView } from "@/lib/types";

export default function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<ApplicationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const s = loadSession();
    setToken(s && s.id === id ? s.token : null);
  }, [id]);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setView(await api.getApplication(id, token));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? `${e.message} (${e.status})` : String(e));
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    if (token) void refresh();
    else setLoading(false);
  }, [token, refresh]);

  if (!token) {
    return (
      <main className="wrap">
        <h1 className="h1">Δεν βρέθηκε session</h1>
        <p className="lead">
          The bearer token for <span className="mono">{id}</span> is not in this browser session. Tokens are
          never recoverable from the server by application id alone — that is deliberate.
        </p>
        <Link className="btn" href="/">
          Νέα αίτηση
        </Link>
      </main>
    );
  }

  return (
    <main className="wrap">
      <h1 className="h1">
        Αίτηση <span className="mono">{id}</span>
      </h1>

      {error && <div className="alert err">{error}</div>}
      {loading && !view && <p className="muted">Loading…</p>}

      {view && (
        <>
          <div className="card">
            <h2 className="h2">Κατάσταση</h2>
            <dl className="kv">
              <dt>State</dt>
              <dd>
                <span className="pill brand">{view.application.state}</span>
              </dd>
              <dt>Journey</dt>
              <dd>{view.application.journey}</dd>
              <dt>Products</dt>
              <dd>{view.application.products.length ? view.application.products.join(", ") : "—"}</dd>
              <dt>Identity</dt>
              <dd>
                {view.application.kyc
                  ? `${view.application.kyc.name} · ${view.application.kyc.method} · assurance ${view.application.kyc.assurance}`
                  : "—"}
              </dd>
              <dt>Signed</dt>
              <dd>{view.application.signed_at ?? "—"}</dd>
              <dt>Catalogue</dt>
              <dd className="mono">{view.catalogue.version}</dd>
            </dl>
          </div>

          <div className="card">
            <h2 className="h2">Ενεργά blocks</h2>
            <div className="row" style={{ marginTop: 0 }}>
              {view.blocks.map((b) => (
                <span className="pill" key={b}>
                  {b}
                </span>
              ))}
            </div>
            {view.required_docs.length > 0 && (
              <>
                <h2 className="h2" style={{ marginTop: 18 }}>
                  Απαιτούμενα έγγραφα
                </h2>
                <div className="row" style={{ marginTop: 0 }}>
                  {view.required_docs.map((d) => {
                    const doc = view.documents.find((x) => x.doc_type === d);
                    const cls = doc?.status === "approved" ? "ok" : doc?.status === "rejected" ? "err" : doc ? "warn" : "";
                    return (
                      <span className={`pill ${cls}`} key={d}>
                        {d} · {doc?.status ?? "missing"}
                      </span>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {!view.application.kyc && <IdentityForm id={id} token={token} onDone={refresh} />}

          <div className="card">
            <h2 className="h2">Ιστορικό</h2>
            <table>
              <thead>
                <tr>
                  <th>At</th>
                  <th>Actor</th>
                  <th>System</th>
                  <th>Event</th>
                </tr>
              </thead>
              <tbody>
                {view.events.map((e, i) => (
                  <tr key={`${e.at}-${i}`}>
                    <td className="mono">{e.at.slice(0, 19).replace("T", " ")}</td>
                    <td>{e.actor}</td>
                    <td>{e.system}</td>
                    <td>{e.event}</td>
                  </tr>
                ))}
                {view.events.length === 0 && (
                  <tr>
                    <td colSpan={4} className="faint">
                      No events yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="row">
            <button className="btn ghost" onClick={refresh} disabled={loading}>
              Ανανέωση
            </button>
            <Link
              className="btn ghost"
              href="/"
              onClick={() => {
                clearSession();
              }}
            >
              Τέλος
            </Link>
          </div>
        </>
      )}
    </main>
  );
}

function IdentityForm({ id, token, onDone }: { id: string; token: string; onDone: () => void }) {
  const [method, setMethod] = useState<"eid" | "manual">("eid");
  const [name, setName] = useState("");
  const [afm, setAfm] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setField(null);
    try {
      await api.submitBlock(id, "identity", token, { method, name, afm, ...(method === "manual" ? { phone } : {}) });
      onDone();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setField(err.field);
      } else {
        setError(String(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2 className="h2">Ταυτοποίηση</h2>
      <p className="small muted" style={{ marginBottom: 14 }}>
        The e-ID route is simulated server-side and yields assurance <b>substantial</b>. The manual route yields{" "}
        <b>low</b>: the ID document can never be auto-approved and activation requires an agent.
      </p>

      {error && <div className="alert err">{field ? `${field}: ${error}` : error}</div>}

      <div className="field">
        <label htmlFor="method">Μέθοδος</label>
        <select id="method" value={method} onChange={(e) => setMethod(e.target.value as "eid" | "manual")}>
          <option value="eid">e-ID Wallet (simulated)</option>
          <option value="manual">Manual entry</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="name">Ονοματεπώνυμο</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
      </div>

      <div className="field">
        <label htmlFor="afm">ΑΦΜ</label>
        <input id="afm" value={afm} onChange={(e) => setAfm(e.target.value)} inputMode="numeric" required />
        <span className="hint">Nine digits.</span>
      </div>

      {method === "manual" && (
        <div className="field">
          <label htmlFor="phone">Κινητό</label>
          <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" required />
          <span className="hint">Verified by OTP before the manual route can proceed.</span>
        </div>
      )}

      <div className="row">
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "…" : "Συνέχεια"}
        </button>
      </div>
    </form>
  );
}
