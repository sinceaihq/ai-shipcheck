-- Initial schema for the fixture application.

create table public.profiles (
  id uuid primary key,
  user_id uuid not null,
  display_name text,
  created_at timestamptz default now()
);

create table public.posts (
  id uuid primary key,
  author_id uuid not null,
  title text not null,
  body text
);

create table public.audit_log (
  id bigserial primary key,
  action text not null
);

alter table public.audit_log enable row level security;

create policy "audit_log is world readable" on public.audit_log
  for all
  to public
  using (true);
