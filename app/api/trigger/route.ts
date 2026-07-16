import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isLocalDataMode, setEventPhase } from "@/lib/local-store";
import type { EventPhase } from "@/lib/types";

const ALLOWED_PHASES: EventPhase[] = ["collecting", "converging", "revealed"];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      secret?: string;
      phase?: EventPhase;
    };

    const expected = process.env.DISPLAY_SECRET;
    if (!expected || body.secret !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const phase = body.phase ?? "converging";
    if (!ALLOWED_PHASES.includes(phase)) {
      return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
    }

    if (isLocalDataMode()) {
      const state = setEventPhase(phase);
      return NextResponse.json({ ok: true, state, mode: "local" });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("event_state")
      .update({ phase, updated_at: new Date().toISOString() })
      .eq("id", "main")
      .select("id, phase, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, state: data, mode: "supabase" });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
