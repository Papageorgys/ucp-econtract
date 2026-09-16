import { NextRequest, NextResponse } from "next/server";
import { AGENT_COOKIE, agentConsolePassword, issueAgentCookie, secretEquals, verifyAgentCookie } from "@/lib/agent-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — is there a live agent session on this browser? */
export async function GET(req: NextRequest) {
  return NextResponse.json({ agent: verifyAgentCookie(req.cookies.get(AGENT_COOKIE)?.value) });
}

/** POST {password} — open a session. POST {action:"logout"} — close it. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { password?: string; action?: string };

  if (body.action === "logout") {
    const res = NextResponse.json({ ok: true, agent: false });
    res.cookies.set(AGENT_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
    return res;
  }

  const expected = agentConsolePassword();
  if (!expected) {
    return NextResponse.json({ error: "AGENT_CONSOLE_PASSWORD is not configured" }, { status: 503 });
  }
  if (typeof body.password !== "string" || !secretEquals(body.password, expected)) {
    return NextResponse.json({ error: "wrong password" }, { status: 401 });
  }

  const cookie = issueAgentCookie();
  if (!cookie) {
    return NextResponse.json({ error: "AGENT_SESSION_SECRET is not configured" }, { status: 503 });
  }

  const res = NextResponse.json({ ok: true, agent: true });
  res.cookies.set(AGENT_COOKIE, cookie.value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: cookie.maxAge,
  });
  return res;
}
