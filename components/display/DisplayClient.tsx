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

const PHASE_RANK: Record<EventPhase, number> = {
  collecting: 0,
  converging: 1,
  revealed: 2,
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
  const [bootError, setBootError] = useState<string | null>(null);
  const revealing = useRef(false);
  const phaseRef = useRef<EventPhase>(phase);
  phaseRef.current = phase;
  /** Ignore stale remote phase while a local trigger is in flight / animating */
  const phaseLockUntil = useRef(0);
  const lockedPhase = useRef<EventPhase | null>(null);
  const localMode = isLocalDataModeClient();

  const applyRemotePhase = useCallback((next: EventPhase) => {
    const now = Date.now();
    const current = phaseRef.current;
    if (next === current) return;

    // While locked, only accept confirmation of the locked phase (or forward progress)
    if (now < phaseLockUntil.current && lockedPhase.current) {
      const locked = lockedPhase.current;
      if (next === locked) {
        lockedPhase.current = null;
        phaseLockUntil.current = 0;
        setPhase(next);
        return;
      }
      // Stale "collecting" while we already started converging/revealed — ignore
      if (PHASE_RANK[next] < PHASE_RANK[locked]) return;
      if (PHASE_RANK[next] < PHASE_RANK[current]) return;
    }

    // Never go backwards in the sequence from remote alone
    if (PHASE_RANK[next] < PHASE_RANK[current]) return;
    // Don't restart converge after reveal
    if (current === "revealed" && next === "converging") return;

    setPhase(next);
  }, []);

  const applyLocalPhase = useCallback((next: EventPhase, lockMs = 8000) => {
    lockedPhase.current = next;
    phaseLockUntil.current = Date.now() + lockMs;
    phaseRef.current = next;
    setPhase(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<ReturnType<typeof createBrowserClient>["channel"]> | null =
      null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let supabase: ReturnType<typeof createBrowserClient> | null = null;

    if (!localMode) {
      try {
        supabase = createBrowserClient();
      } catch (err) {
        setBootError(err instanceof Error ? err.message : "Missing Supabase env");
        setReady(true);
        return;
      }
    }

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
        if (stateJson.state?.phase) {
          applyRemotePhase(stateJson.state.phase as EventPhase);
        }
        setReady(true);
      }

      await refresh();
      pollTimer = setInterval(refresh, 1200);
    }

    async function bootSupabase() {
      if (!supabase) return;

      try {
        const [{ data: wishRows, error: wishErr }, { data: stateRow, error: stateErr }] =
          await Promise.all([
            supabase
              .from("wishes")
              .select("id, message, author, created_at")
              .order("created_at", { ascending: false })
              .limit(MAX_DISPLAY_WISHES),
            supabase.from("event_state").select("phase").eq("id", "main").single(),
          ]);

        if (cancelled) return;
        if (wishErr || stateErr) {
          setBootError(wishErr?.message || stateErr?.message || "Supabase query failed");
          setReady(true);
          return;
        }
        if (wishRows) setWishes([...wishRows].reverse());
        if (stateRow?.phase) setPhase(stateRow.phase as EventPhase);
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        setBootError(err instanceof Error ? err.message : "Failed to connect Supabase");
        setReady(true);
        return;
      }

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
          { event: "DELETE", schema: "public", table: "wishes" },
          (payload) => {
            const id = (payload.old as { id?: string } | null)?.id;
            if (!id) {
              setWishes([]);
              return;
            }
            setWishes((prev) => prev.filter((w) => w.id !== id));
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "event_state" },
          (payload) => {
            const nextPhase = (payload.new as { phase?: EventPhase }).phase;
            if (nextPhase) applyRemotePhase(nextPhase);
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
      if (channel && supabase) {
        void supabase.removeChannel(channel);
      }
    };
  }, [localMode, applyRemotePhase]);

  const triggerPhase = useCallback(
    async (next: EventPhase) => {
      // Switch UI/animation immediately — never wait for network
      applyLocalPhase(next);
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
      } finally {
        setBusy(false);
      }
    },
    [secret, applyLocalPhase],
  );

  const clearWishes = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    applyLocalPhase("collecting");
    revealing.current = false;
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
    } finally {
      setBusy(false);
    }
  }, [secret, busy, applyLocalPhase]);

  const onConvergeComplete = useCallback(() => {
    if (revealing.current) return;
    if (phaseRef.current === "revealed") return;
    revealing.current = true;
    // Local only first — keep animation smooth; persist in background
    applyLocalPhase("revealed");
    void fetch("/api/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, phase: "revealed" }),
    }).then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Reveal persist failed", data);
      }
    });
  }, [secret, applyLocalPhase]);

  useEffect(() => {
    if (phase === "collecting") revealing.current = false;
    if (phase === "revealed") revealing.current = true;
  }, [phase]);

  const canActivate =
    phase === "collecting" && !busy && wishes.length > 0 && ready;

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
          {localMode ? " · local" : " · supabase"}
        </p>
        {bootError ? (
          <p className="display-meta" style={{ color: "#ffb4a8", maxWidth: 420 }}>
            {bootError}
          </p>
        ) : null}
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
            disabled={!canActivate}
            onClick={() => {
              if (!canActivate) return;
              revealing.current = false;
              void triggerPhase("converging");
            }}
          >
            Kích hoạt
          </button>
        )}

        {phase === "revealed" && (
          <button
            type="button"
            className="display-reset"
            disabled={busy}
            onClick={() => {
              revealing.current = false;
              void triggerPhase("collecting");
            }}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
