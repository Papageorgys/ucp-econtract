import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

export const AGENT_COOKIE = "econtract_agent";
const TTL_MS = 8 * 60 * 60 * 1000;

/**
 * Secret for signing the agent console cookie. Distinct from PROTO_AGENT_TOKEN on purpose:
 * the upstream token must never be derivable from anything that reaches the browser.
 */
function sessionSecret(): string | null {
  return process.env.AGENT_SESSION_SECRET ?? null;
}

export function agentConsolePassword(): string | null {
  return process.env.AGENT_CONSOLE_PASSWORD ?? null;
}

/** Constant-time compare that does not leak length through an early return. */
export function secretEquals(a: string, b: string): boolean {
  const ha = createHmac("sha256", "cmp").update(a).digest();
  const hb = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function issueAgentCookie(): { value: string; maxAge: number } | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const expires = Date.now() + TTL_MS;
  const nonce = randomBytes(9).toString("base64url");
  const payload = `v1.${expires}.${nonce}`;
  const mac = createHmac("sha256", secret).update(payload).digest("base64url");
  return { value: `${payload}.${mac}`, maxAge: Math.floor(TTL_MS / 1000) };
}

export function verifyAgentCookie(value: string | undefined): boolean {
  const secret = sessionSecret();
  if (!secret || !value) return false;
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  const [, expiresRaw, nonce, mac] = parts;
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = createHmac("sha256", secret).update(`v1.${expiresRaw}.${nonce}`).digest("base64url");
  return secretEquals(mac, expected);
}
