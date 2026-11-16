-- FlashClass foundation: private schema, locked-down default privileges, enums,
-- helpers, profiles and protected roles.
--
-- Security model (see docs/architecture.md):
--   * Nothing in `public` is reachable by API roles unless granted explicitly.
--   * RLS is enabled on every exposed table; grants decide WHICH operations exist,
--     policies decide WHICH ROWS they touch.
--   * Privileged writes go through narrow SECURITY DEFINER functions with an
--     empty search_path and schema-qualified references.

create schema if not exists app_private;
revoke all on schema app_private from public;
-- Usage is needed so RLS policies can call helper functions. The schema is NOT
-- listed in the Data API schemas (supabase/config.toml), and its tables have no
-- grants, so answer keys stay unreachable.
grant usage on schema app_private to authenticated, service_role;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema app_private revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('student', 'teacher', 'admin');
create type public.ui_locale as enum ('bg', 'en');
create type public.material_kind as enum ('quiz', 'flashcards', 'practice_test', 'study_guide');
create type public.material_status as enum ('draft', 'published', 'archived', 'hidden');
create type public.material_visibility as enum ('private', 'shared');
create type public.question_type as enum ('single_choice', 'multiple_select', 'true_false', 'short_answer');
create type public.cefr_level as enum ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');
create type public.difficulty_level as enum ('beginner', 'intermediate', 'advanced', 'expert');
create type public.attempt_status as enum ('in_progress', 'submitted');
create type public.report_status as enum ('open', 'resolved', 'dismissed');
create type public.report_reason as enum ('inappropriate', 'incorrect', 'spam', 'copyright', 'other');

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles: one per Auth user. No password, no role, no email copy.
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  grade_preference text check (grade_preference ~ '^([1-9]|1[0-2]|other)$'),
  ui_locale public.ui_locale not null default 'bg',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.grade_preference is
  'Optional school grade 1-12 or "other". Used ONLY to rank recommendations; never restricts access and is not an age claim.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Roles: protected table, never user-editable, never derived from metadata.
-- ---------------------------------------------------------------------------
create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id) on delete set null,
  primary key (user_id, role)
);

create index user_roles_role_idx on public.user_roles (role);

-- Current-grant role check. Reads the table (not JWT claims) so revocation is
-- immediate. SECURITY DEFINER avoids recursive RLS on user_roles.
create or replace function app_private.has_role(p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid()) and r.role = p_role
  );
$$;

create or replace function app_private.require_role(p_role public.app_role)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not app_private.has_role(p_role) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

revoke all on function app_private.has_role(public.app_role) from public;
revoke all on function app_private.require_role(public.app_role) from public;
grant execute on function app_private.has_role(public.app_role) to authenticated, service_role;
grant execute on function app_private.require_role(public.app_role) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- New Auth user -> profile + student role. Requested roles in signup metadata
-- are deliberately ignored.
-- ---------------------------------------------------------------------------
create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60));
  v_locale text := new.raw_user_meta_data ->> 'ui_locale';
begin
  if v_name = '' then
    v_name := btrim(left(split_part(coalesce(new.email, ''), '@', 1), 60));
  end if;
  if v_name = '' then
    v_name := 'user';
  end if;

  insert into public.profiles (user_id, display_name, ui_locale)
  values (
    new.id,
    v_name,
    case when v_locale in ('bg', 'en') then v_locale::public.ui_locale else 'bg'::public.ui_locale end
  );

  insert into public.user_roles (user_id, role) values (new.id, 'student');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy profiles_select_admin on public.profiles
  for select to authenticated
  using ((select app_private.has_role('admin')));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select on public.profiles to authenticated;
grant update (display_name, grade_preference, ui_locale) on public.profiles to authenticated;

create policy user_roles_select_own on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy user_roles_select_admin on public.user_roles
  for select to authenticated
  using ((select app_private.has_role('admin')));

grant select on public.user_roles to authenticated;
-- No insert/update/delete grants: roles change only through the functions below.

-- Public author names for the library. Exposes display_name of teachers only,
-- never students. Runs with the view owner's rights on purpose.
create view public.teacher_directory with (security_barrier = true) as
  select p.user_id, p.display_name
  from public.profiles p
  where exists (
    select 1 from public.user_roles r where r.user_id = p.user_id and r.role = 'teacher'
  );

grant select on public.teacher_directory to authenticated;

-- ---------------------------------------------------------------------------
-- Admin role management
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_role(p_user_id uuid, p_role public.app_role, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_role('admin');

  if p_role = 'student' then
    raise exception 'student_role_is_permanent' using errcode = '22023';
  end if;
  if not p_enabled and p_role = 'admin' and p_user_id = (select auth.uid()) then
    raise exception 'cannot_remove_own_admin' using errcode = '22023';
  end if;

  if p_enabled then
    insert into public.user_roles (user_id, role, granted_by)
    values (p_user_id, p_role, (select auth.uid()))
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles r where r.user_id = p_user_id and r.role = p_role;
  end if;
end;
$$;

create or replace function public.admin_list_users(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (user_id uuid, email text, display_name text, roles public.app_role[], created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform app_private.require_role('admin');

  return query
    select
      u.id,
      u.email::text,
      p.display_name,
      coalesce(array_agg(r.role order by r.role) filter (where r.role is not null), '{}'::public.app_role[]),
      u.created_at
    from auth.users u
    left join public.profiles p on p.user_id = u.id
    left join public.user_roles r on r.user_id = u.id
    where nullif(btrim(p_search), '') is null
       or u.email ilike '%' || btrim(p_search) || '%'
       or p.display_name ilike '%' || btrim(p_search) || '%'
    group by u.id, u.email, p.display_name, u.created_at
    order by u.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Used only by the invite-teacher Edge Function (service_role). The function
-- verifies the caller is an admin before calling this.
create or replace function public.service_grant_role_by_email(p_email text, p_role public.app_role, p_granted_by uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select u.id into v_user_id from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_user_id is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  insert into public.user_roles (user_id, role, granted_by)
  values (v_user_id, p_role, p_granted_by)
  on conflict (user_id, role) do nothing;

  return v_user_id;
end;
$$;

revoke all on function public.admin_set_role(uuid, public.app_role, boolean) from public, anon;
revoke all on function public.admin_list_users(text, integer, integer) from public, anon;
revoke all on function public.service_grant_role_by_email(text, public.app_role, uuid) from public, anon, authenticated;
grant execute on function public.admin_set_role(uuid, public.app_role, boolean) to authenticated;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated;
grant execute on function public.service_grant_role_by_email(text, public.app_role, uuid) to service_role;
