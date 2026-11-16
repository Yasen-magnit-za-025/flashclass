-- Library search, bookmarks, content reports and admin moderation.

-- ---------------------------------------------------------------------------
-- Bookmarks: a pointer to a published material, never a copy or ownership.
-- ---------------------------------------------------------------------------
create table public.saved_materials (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  material_id uuid not null references public.learning_materials (id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, material_id)
);

create index saved_materials_material_idx on public.saved_materials (material_id);

alter table public.saved_materials enable row level security;

create policy saved_materials_select_own on public.saved_materials
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Only currently published library items can be bookmarked. The subquery runs
-- under the caller's RLS, so drafts/hidden items are invisible to it.
create policy saved_materials_insert_own on public.saved_materials
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.learning_materials m
      where m.id = material_id and m.status = 'published' and m.visibility = 'shared'
    )
  );

create policy saved_materials_delete_own on public.saved_materials
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, delete on public.saved_materials to authenticated;
grant insert (material_id) on public.saved_materials to authenticated;

-- ---------------------------------------------------------------------------
-- Reports: private to the reporter and admins.
-- ---------------------------------------------------------------------------
create table public.material_reports (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.learning_materials (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason public.report_reason not null,
  details text not null default '' check (char_length(details) <= 1000),
  status public.report_status not null default 'open',
  resolution_note text not null default '' check (char_length(resolution_note) <= 1000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null
);

create index material_reports_status_idx on public.material_reports (status, created_at desc);
create index material_reports_material_idx on public.material_reports (material_id);
create index material_reports_reporter_idx on public.material_reports (reporter_id);
create unique index material_reports_one_open_per_reporter_idx
  on public.material_reports (material_id, reporter_id) where status = 'open';

create or replace function app_private.material_reports_track_resolution()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'open' then
      new.resolved_at := null;
      new.resolved_by := null;
    else
      new.resolved_at := now();
      new.resolved_by := (select auth.uid());
    end if;
  end if;
  return new;
end;
$$;

create trigger material_reports_track_resolution
  before update on public.material_reports
  for each row execute function app_private.material_reports_track_resolution();

alter table public.material_reports enable row level security;

create policy material_reports_select_own on public.material_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()));

create policy material_reports_select_admin on public.material_reports
  for select to authenticated
  using ((select app_private.has_role('admin')));

create policy material_reports_insert_own on public.material_reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and status = 'open'
    and exists (
      select 1 from public.learning_materials m
      where m.id = material_id and m.status = 'published' and m.visibility = 'shared'
    )
  );

create policy material_reports_update_admin on public.material_reports
  for update to authenticated
  using ((select app_private.has_role('admin')))
  with check ((select app_private.has_role('admin')));

grant select on public.material_reports to authenticated;
grant insert (material_id, reason, details) on public.material_reports to authenticated;
grant update (status, resolution_note) on public.material_reports to authenticated;

-- ---------------------------------------------------------------------------
-- Admin moderation: hide / restore. Restored material goes back to the
-- teacher as archived; republishing requires a fresh all-ages attestation.
-- ---------------------------------------------------------------------------
create or replace function public.moderate_material(p_id uuid, p_action text, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.material_status;
begin
  perform app_private.require_role('admin');

  select m.status into v_status from public.learning_materials m where m.id = p_id for update;
  if v_status is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_action = 'hide' then
    if v_status = 'hidden' then
      return;
    end if;
    update public.learning_materials m set
      status = 'hidden',
      visibility = 'private',
      hidden_at = now(),
      hidden_by = (select auth.uid()),
      hidden_reason = left(coalesce(p_reason, ''), 1000)
    where m.id = p_id;

    update public.material_reports r set
      status = 'resolved',
      resolution_note = case when r.resolution_note = '' then 'Material hidden' else r.resolution_note end
    where r.material_id = p_id and r.status = 'open';

  elsif p_action = 'restore' then
    if v_status <> 'hidden' then
      raise exception 'invalid_status' using errcode = '22023';
    end if;
    update public.learning_materials m set
      status = 'archived',
      visibility = 'private',
      hidden_at = null,
      hidden_by = null,
      hidden_reason = null
    where m.id = p_id;
  else
    raise exception 'invalid_action' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.moderate_material(uuid, text, text) from public, anon;
grant execute on function public.moderate_material(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Library search. SECURITY INVOKER: RLS still applies.
-- Ranking: text relevance, then closeness to the caller's optional grade
-- preference, then recency. Grade preference never filters anything out.
-- ---------------------------------------------------------------------------
create or replace function public.search_library(
  p_query text default null,
  p_subject text default null,
  p_kind public.material_kind default null,
  p_school_grade smallint default null,
  p_cefr_level public.cefr_level default null,
  p_difficulty public.difficulty_level default null,
  p_language text default null,
  p_saved_only boolean default false,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id uuid,
  kind public.material_kind,
  title text,
  description text,
  language text,
  subject_code text,
  school_grade smallint,
  cefr_level public.cefr_level,
  difficulty_level public.difficulty_level,
  published_at timestamptz,
  owner_id uuid,
  author_name text,
  item_count integer,
  is_saved boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      nullif(btrim(p_query), '') as q,
      case when nullif(btrim(p_query), '') is null then null
           else websearch_to_tsquery('simple'::regconfig, btrim(p_query)) end as tsq
  ), pref as (
    select case when p.grade_preference ~ '^[0-9]+$' then p.grade_preference::integer end as grade
    from public.profiles p
    where p.user_id = (select auth.uid())
  )
  select
    m.id, m.kind, m.title, m.description, m.language, m.subject_code,
    m.school_grade, m.cefr_level, m.difficulty_level, m.published_at, m.owner_id,
    t.display_name,
    app_private.material_item_count(m.kind, m.content, m.id),
    exists (
      select 1 from public.saved_materials s
      where s.material_id = m.id and s.user_id = (select auth.uid())
    )
  from public.learning_materials m
  cross join params
  left join pref on true
  left join public.teacher_directory t on t.user_id = m.owner_id
  where m.status = 'published'
    and m.visibility = 'shared'
    and (params.q is null
         or m.search @@ params.tsq
         or m.title ilike '%' || replace(replace(params.q, '%', '\%'), '_', '\_') || '%')
    and (p_subject is null or m.subject_code = p_subject)
    and (p_kind is null or m.kind = p_kind)
    and (p_school_grade is null or m.school_grade = p_school_grade)
    and (p_cefr_level is null or m.cefr_level = p_cefr_level)
    and (p_difficulty is null or m.difficulty_level = p_difficulty)
    and (p_language is null or m.language = p_language)
    and (not coalesce(p_saved_only, false) or exists (
      select 1 from public.saved_materials s
      where s.material_id = m.id and s.user_id = (select auth.uid())
    ))
  order by
    case when params.tsq is null then 0 else ts_rank(m.search, params.tsq) end desc,
    case when pref.grade is null or m.school_grade is null then 99
         else abs(m.school_grade - pref.grade) end,
    m.published_at desc
  limit least(greatest(coalesce(p_limit, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.search_library(text, text, public.material_kind, smallint, public.cefr_level, public.difficulty_level, text, boolean, integer, integer) from public, anon;
grant execute on function public.search_library(text, text, public.material_kind, smallint, public.cefr_level, public.difficulty_level, text, boolean, integer, integer) to authenticated;
