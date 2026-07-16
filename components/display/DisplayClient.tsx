"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createBrowserClient } from "@/lib/supabase/client";
import { isLocalDataModeClient } from "@/lib/data-mode";
import { MAX_DISPLAY_WISHES, type EventPhase, type Wish } from "@/lib/types";

const DisplayCanvas = dynamic(() => import("./DisplayCanvas"), { ssr: false });

type DisplayClientProps = {
  secret: string;
};

function mergeWish(prev: Wish[], row: Wish) {
  if (prev.some((w) => w.id === row.id)) return prev;
  const next = [...prev, row];
  return next.length > MAX_DISPLAY_WISHES
    ? next.slice(next.length - MAX_DISPLAY_WISHES)
    : next;
}

export default function DisplayClient({ secret }: DisplayClientProps) {
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [phase, setPhase] = useState<EventPhase>("collecting");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const revealing = useRef(false);
  const localMode = isLocalDataModeClient();

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<ReturnType<typeof createBrowserClient>["channel"]> | null =
      null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    async function bootLocal() {
      async function refresh() {
        const [wishesRes, stateRes] = await Promise.all([
          fetch("/api/wishes"),
          fetch("/api/event-state"),
        ]);
        const wishesJson = await wishesRes.json();
        const stateJson = await stateRes.json();
        if (cancelled) return;
        if (Array.isArray(wishesJson.wishes)) setWishes(wishesJson.wishes);
        if (stateJson.state?.phase) setPhase(stateJson.state.phase as EventPhase);
        setReady(true);
      }

      await refresh();
      pollTimer = setInterval(refresh, 1200);
    }

    async function bootSupabase() {
      const supabase = createBrowserClient();
      const [{ data: wishRows }, { data: stateRow }] = await Promise.all([
        supabase
          .from("wishes")
          .select("id, message, author, created_at")
          .order("created_at", { ascending: false })
          .limit(MAX_DISPLAY_WISHES),
        supabase.from("event_state").select("phase").eq("id", "main").single(),
      ]);

      if (cancelled) return;
      if (wishRows) setWishes([...wishRows].reverse());
      if (stateRow?.phase) setPhase(stateRow.phase as EventPhase);
      setReady(true);

      channel = supabase
        .channel("display-realtime")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "wishes" },
          (payload) => {
            setWishes((prev) => mergeWish(prev, payload.new as Wish));
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "event_state" },
          (payload) => {
            const nextPhase = (payload.new as { phase?: EventPhase }).phase;
            if (nextPhase) setPhase(nextPhase);
          },
        )
        .subscribe();
    }

    if (localMode) {
      void bootLocal();
    } else {
      void bootSupabase();
    }

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (channel) {
        const supabase = createBrowserClient();
        supabase.removeChannel(channel);
      }
    };
  }, [localMode]);

  const triggerPhase = useCallback(
    async (next: EventPhase) => {
      setBusy(true);
      try {
        const res = await fetch("/api/trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ secret, phase: next }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.error("Trigger failed", data);
          return;
        }
        if (localMode) setPhase(next);
      } finally {
        setBusy(false);
      }
    },
    [secret, localMode],
  );

  const clearWishes = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/wishes/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, resetPhase: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Clear failed", data);
        return;
      }
      setWishes([]);
      setPhase("collecting");
      revealing.current = false;
    } finally {
      setBusy(false);
    }
  }, [secret, busy]);

  const onConvergeComplete = useCallback(() => {
    if (revealing.current) return;
    revealing.current = true;
    void triggerPhase("revealed");
  }, [triggerPhase]);

  useEffect(() => {
    if (phase === "collecting") revealing.current = false;
  }, [phase]);

  return (
    <div className="display-root">
      {ready ? (
        <DisplayCanvas
          wishes={wishes}
          phase={phase}
          onConvergeComplete={onConvergeComplete}
        />
      ) : (
        <div className="display-loading">Đang kết nối…</div>
      )}

      <div className="display-chrome">
        <p className="display-brand">2Res Demo</p>
        <p className="display-meta">
          {wishes.length} lời chúc · {phase}
          {localMode ? " · local" : ""}
        </p>
      </div>

      <div className="display-actions">
        <button
          type="button"
          className="display-clear"
          disabled={busy || wishes.length === 0}
          onClick={() => clearWishes()}
        >
          Clear
        </button>

        {phase === "collecting" && (
          <button
            type="button"
            className="display-trigger"
            disabled={busy || wishes.length === 0}
            onClick={() => triggerPhase("converging")}
          >
            {busy ? "…" : "Kích hoạt"}
          </button>
        )}

        {phase === "revealed" && (
          <button
            type="button"
            className="display-reset"
            disabled={busy}
            onClick={() => triggerPhase("collecting")}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
