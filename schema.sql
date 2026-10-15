create table if not exists public.gametime_state (
  id integer primary key check (id = 1),
  state jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.gametime_state (id, state)
values (1, '{"limit":150,"players":{"zsolo":{"days":{}},"denes":{"days":{}}}}'::jsonb)
on conflict (id) do nothing;

-- A böngésző közvetlenül nem fér hozzá a táblához.
alter table public.gametime_state enable row level security;
revoke all on public.gametime_state from anon, authenticated;

-- Audit napló a szülői műveletekhez
create table if not exists public.gametime_audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  action text not null check (action in ('setLimit', 'adjust', 'reset', 'editSession', 'deleteSession')),
  child text null check (child is null or child in ('zsolo', 'denes')),
  minutes integer null,
  old_limit integer null,
  new_limit integer null
);
alter table public.gametime_audit_log enable row level security;
revoke all on public.gametime_audit_log from anon, authenticated;

-- Ha a naplótábla már korábban létrejött, frissítsük a megengedett műveleteket is.
alter table public.gametime_audit_log
  drop constraint if exists gametime_audit_log_action_check;
alter table public.gametime_audit_log
  add constraint gametime_audit_log_action_check
  check (action in ('setLimit', 'adjust', 'reset', 'editSession', 'deleteSession'));
