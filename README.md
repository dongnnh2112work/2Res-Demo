# 2Res Demo — Wish Wall Keymoment

Realtime wish wall for events: guests submit wishes via a shared QR page; the LED display shows them in 3D and converges into a KV reveal.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Three.js via `@react-three/fiber` + `@react-three/drei`
- Supabase (Postgres + Realtime)
- Deploy on Vercel

## Pages

| URL | Purpose |
|-----|---------|
| `/wish` | Guest form (print this URL as QR) |
| `/display/<DISPLAY_SECRET>` | LED screen + activate button |
| `/` | Redirects to `/wish` |

## Setup

### 1. Supabase

1. Create a Supabase project.
2. Open **SQL Editor** and run [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql).
3. Confirm **Realtime** is enabled for `wishes` and `event_state` (migration adds them to `supabase_realtime`).
4. Copy **Project URL**, **anon key**, and **service_role key** from Project Settings → API.

### 2. Local env

```bash
cp .env.example .env.local
```

**Không có Supabase ngay:** giữ `NEXT_PUBLIC_SUPABASE_URL` chứa `placeholder` — app tự dùng **in-memory store** (submit + LED poll ~1.2s). Phù hợp demo local.

**Có Supabase:** điền URL/key thật (không chứa `placeholder`), set `SUPABASE_SERVICE_ROLE_KEY`, chạy migration.

```bash
npm install
npm run dev
```

- Guests: [http://localhost:3000/wish](http://localhost:3000/wish)
- LED: `http://localhost:3000/display/<DISPLAY_SECRET>`

### 3. Vercel

1. Push this repo and import into Vercel.
2. Set the same env vars in the Vercel project.
3. Deploy.
4. Print QR → `https://<your-domain>/wish`
5. Open LED browser → `https://<your-domain>/display/<DISPLAY_SECRET>`

## Operator flow

1. Open the display URL on the LED machine.
2. Guests scan QR and submit wishes — they appear floating in realtime.
3. When ready, click **Kích hoạt** (bottom-right, intentionally low-contrast).
4. Wishes converge to center, then the KV placeholder unveils.
5. Optional: **Reset** returns phase to `collecting` for another run.

## Replace KV

Replace [`public/kv.jpg`](public/kv.jpg) with the final key visual (landscape recommended). Unveil uses this file in [`components/display/DisplayScene.tsx`](components/display/DisplayScene.tsx).

## Reset wishes between events

In Supabase SQL:

```sql
delete from public.wishes;
update public.event_state set phase = 'collecting', updated_at = now() where id = 'main';
```
