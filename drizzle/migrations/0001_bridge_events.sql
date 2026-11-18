create table public.bridge_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  created_at timestamptz not null default now()
);
grant select on public.bridge_events to authenticated;
grant all on public.bridge_events to service_role;
alter table public.bridge_events enable row level security;

create policy "Staff can read bridge events"
on public.bridge_events for select to authenticated
using (public.has_role(auth.uid(), 'staff'));