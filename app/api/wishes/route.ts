import { NextResponse } from "next/server";
import { addWish, isLocalDataMode, listWishes } from "@/lib/local-store";
import { MAX_WISH_LENGTH } from "@/lib/types";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  if (isLocalDataMode()) {
    return NextResponse.json({ wishes: listWishes(), mode: "local" });
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("wishes")
      .select("id, message, author, created_at")
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ wishes: data ?? [], mode: "supabase" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load wishes" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      message?: string;
      author?: string | null;
    };

    const message = (body.message ?? "").trim().slice(0, MAX_WISH_LENGTH);
    if (!message) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    const author = body.author?.trim() ? body.author.trim().slice(0, 40) : null;

    if (isLocalDataMode()) {
      const wish = addWish(message, author);
      return NextResponse.json({ ok: true, wish, mode: "local" });
    }

    try {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("wishes")
        .insert({ message, author })
        .select("id, message, author, created_at")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, wish: data, mode: "supabase" });
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Missing Supabase env on Vercel — set keys and Redeploy",
        },
        { status: 500 },
      );
    }
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
