-- 2Res Demo — Wish Wall schema

create table if not exists public.wishes (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(message) >= 1 and char_length(message) <= 160),
  author text,
  created_at timestamptz not null default now()
);

create table if not exists public.event_state (
  id text primary key,
  phase text not null check (phase in ('collecting', 'converging', 'revealed')),
  updated_at timestamptz not null default now()
);

insert into public.event_state (id, phase)
values ('main', 'collecting')
on conflict (id) do nothing;

alter table public.wishes enable row level security;
alter table public.event_state enable row level security;

-- Guests can submit and the display can read wishes
create policy "wishes_anon_select"
  on public.wishes for select
  to anon
  using (true);

create policy "wishes_anon_insert"
  on public.wishes for insert
  to anon
  with check (true);

-- Display can read phase; updates go through server (service role)
create policy "event_state_anon_select"
  on public.event_state for select
  to anon
  using (true);

-- Realtime
alter publication supabase_realtime add table public.wishes;
alter publication supabase_realtime add table public.event_state;
