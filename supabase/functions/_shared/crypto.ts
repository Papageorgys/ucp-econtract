export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const h = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function randomId(prefix: string, n = 6) {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const r = crypto.getRandomValues(new Uint8Array(n));
  return prefix + [...r].map((x) => a[x % a.length]).join("");
}
export function randomToken(n = 32) {
  const r = crypto.getRandomValues(new Uint8Array(n)); return [...r].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function otpCode() { return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0"); }
export function maskPhone(p: string) { return p.replace(/\d(?=\d{3})/g, "•"); }
