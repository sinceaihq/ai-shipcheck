-- Housekeeping migration.

drop table public.legacy_sessions;

alter table public.profiles drop column nickname;

delete from public.audit_log;

select * from public.posts;
