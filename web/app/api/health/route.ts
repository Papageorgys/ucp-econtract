import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reports whether each server variable is set. Never reports a value. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: {
      SUPABASE_FUNCTIONS_URL: Boolean(process.env.SUPABASE_FUNCTIONS_URL),
      PROTO_AGENT_TOKEN: Boolean(process.env.PROTO_AGENT_TOKEN),
      AGENT_CONSOLE_PASSWORD: Boolean(process.env.AGENT_CONSOLE_PASSWORD),
      AGENT_SESSION_SECRET: Boolean(process.env.AGENT_SESSION_SECRET),
    },
  });
}
