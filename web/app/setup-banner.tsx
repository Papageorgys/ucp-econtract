"use client";

import { useEffect, useState } from "react";

type Health = { configured: Record<string, boolean> };

/** Shown when the Vercel project is missing server variables, so an unconfigured deploy is legible. */
export default function SetupBanner() {
  const [missing, setMissing] = useState<string[] | null>(null);

  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json() as Promise<Health>)
      .then((h) => setMissing(Object.entries(h.configured).filter(([, v]) => !v).map(([k]) => k)))
      .catch(() => setMissing(null));
  }, []);

  if (!missing || missing.length === 0) return null;

  return (
    <div className="wrap" style={{ paddingBottom: 0 }}>
      <div className="alert warn">
        <b>Not configured.</b> This deployment is missing {missing.length} environment variable
        {missing.length > 1 ? "s" : ""}, so calls to Supabase will fail with 503. Set{" "}
        {missing.map((m, i) => (
          <span key={m}>
            {i > 0 && ", "}
            <span className="mono">{m}</span>
          </span>
        ))}{" "}
        in the Vercel project settings and redeploy. See <span className="mono">web/.env.example</span>.
      </div>
    </div>
  );
}
