import { NextResponse } from "next/server";
import { getEventState, isLocalDataMode } from "@/lib/local-store";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  if (isLocalDataMode()) {
    return NextResponse.json({ state: getEventState(), mode: "local" });
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("event_state")
      .select("id, phase, updated_at")
      .eq("id", "main")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ state: data, mode: "supabase" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load state" },
      { status: 500 },
    );
  }
}
