"use client";

import { useEffect, useState } from "react";

type Health = { configured: Record<string, boolean> };

/**
 * Tells the truth about what a missing variable actually breaks.
 *
 * SUPABASE_FUNCTIONS_URL is the only one the customer journey needs — without it every
 * proxied call is a 503. The other three gate the agent console alone; the customer side
 * works fine without them. Reporting "4 missing, calls will fail" made an agent-only gap
 * look like total failure.
 */
const AGENT_VARS = ["PROTO_AGENT_TOKEN", "AGENT_CONSOLE_PASSWORD", "AGENT_SESSION_SECRET"];

export default function SetupBanner() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json() as Promise<Health>)
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  if (!health) return null;

  const upstreamMissing = !health.configured.SUPABASE_FUNCTIONS_URL;
  const agentMissing = AGENT_VARS.filter((v) => !health.configured[v]);

  if (!upstreamMissing && agentMissing.length === 0) return null;

  return (
    <div className="wrap" style={{ paddingBottom: 0 }}>
      {upstreamMissing && (
        <div className="alert err">
          <b>Backend not configured.</b> <span className="mono">SUPABASE_FUNCTIONS_URL</span> is unset, so every
          call returns 503 and nothing on this page works. Set it in the Vercel project settings, or commit it to{" "}
          <span className="mono">web/.env.production</span>.
        </div>
      )}

      {agentMissing.length > 0 && (
        <div className="alert warn">
          <b>Agent console unavailable.</b> The customer journey below is unaffected. Missing{" "}
          {agentMissing.map((m, i) => (
            <span key={m}>
              {i > 0 && ", "}
              <span className="mono">{m}</span>
            </span>
          ))}
          {" — "}
          set them in the Vercel project settings (see <span className="mono">web/.env.example</span>).{" "}
          <span className="mono">PROTO_AGENT_TOKEN</span> must match the Supabase function secret of the same name,
          or the upstream rejects every agent request regardless.
        </div>
      )}
    </div>
  );
}
