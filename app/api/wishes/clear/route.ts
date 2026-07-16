import { NextResponse } from "next/server";
import { clearWishes, isLocalDataMode, setEventPhase } from "@/lib/local-store";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      secret?: string;
      resetPhase?: boolean;
    };

    const expected = process.env.DISPLAY_SECRET;
    if (!expected || body.secret !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (isLocalDataMode()) {
      clearWishes();
      if (body.resetPhase !== false) {
        setEventPhase("collecting");
      }
      return NextResponse.json({ ok: true, cleared: true, mode: "local" });
    }

    const supabase = createServiceClient();
    const { error } = await supabase.from("wishes").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (body.resetPhase !== false) {
      await supabase
        .from("event_state")
        .update({ phase: "collecting", updated_at: new Date().toISOString() })
        .eq("id", "main");
    }

    return NextResponse.json({ ok: true, cleared: true, mode: "supabase" });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
