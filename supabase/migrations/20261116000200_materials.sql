-- Learning materials, subject taxonomy, questions and private answer keys.
--
-- Write path: teachers never INSERT/UPDATE these tables directly. All writes go
-- through save_material / publish_material / unpublish_material (teachers) and
-- moderate_material (admins). This keeps answer keys, status transitions and the
-- all-ages attestation in one audited place. Reads use RLS.

-- ---------------------------------------------------------------------------
-- Subject taxonomy: decides which suitability scale a material uses.
--   grade      -> school subject, one primary grade 1-12
--   cefr       -> English, CEFR A1-C2 only
--   difficulty -> non-school topic, beginner..expert
-- ---------------------------------------------------------------------------
create table public.subjects (
  code text primary key check (code ~ '^[a-z][a-z_]{1,39}$'),
  level_scheme text not null check (level_scheme in ('grade', 'cefr', 'difficulty')),
  sort_order integer not null default 100,
  name_bg text not null,
  name_en text not null
);

insert into public.subjects (code, level_scheme, sort_order, name_bg, name_en) values
  ('bulgarian_language',   'grade',      10, 'Български език и литература',      'Bulgarian Language and Literature'),
  ('mathematics',          'grade',      20, 'Математика',                       'Mathematics'),
  ('english',              'cefr',       30, 'Английски език',                   'English'),
  ('german',               'grade',      31, 'Немски език',                      'German'),
  ('french',               'grade',      32, 'Френски език',                     'French'),
  ('spanish',              'grade',      33, 'Испански език',                    'Spanish'),
  ('russian',              'grade',      34, 'Руски език',                       'Russian'),
  ('surrounding_world',    'grade',      40, 'Околен свят',                      'The World Around Us'),
  ('man_and_nature',       'grade',      41, 'Човекът и природата',              'Man and Nature'),
  ('man_and_society',      'grade',      42, 'Човекът и обществото',             'Man and Society'),
  ('physics',              'grade',      50, 'Физика и астрономия',              'Physics and Astronomy'),
  ('chemistry',            'grade',      51, 'Химия и опазване на околната среда','Chemistry and Environmental Protection'),
  ('biology',              'grade',      52, 'Биология и здравно образование',   'Biology and Health Education'),
  ('history',              'grade',      60, 'История и цивилизации',            'History and Civilizations'),
  ('geography',            'grade',      61, 'География и икономика',            'Geography and Economics'),
  ('philosophy',           'grade',      62, 'Философия',                        'Philosophy'),
  ('civics',               'grade',      63, 'Гражданско образование',           'Civic Education'),
  ('informatics',          'grade',      70, 'Информатика',                      'Informatics'),
  ('information_technology','grade',     71, 'Информационни технологии',         'Information Technology'),
  ('technology',           'grade',      72, 'Технологии и предприемачество',    'Technology and Entrepreneurship'),
  ('music',                'grade',      80, 'Музика',                           'Music'),
  ('fine_arts',            'grade',      81, 'Изобразително изкуство',           'Fine Arts'),
  ('physical_education',   'grade',      82, 'Физическо възпитание и спорт',     'Physical Education and Sport'),
  ('programming',          'difficulty',200, 'Програмиране',                     'Programming'),
  ('general_knowledge',    'difficulty',210, 'Обща култура',                     'General Knowledge'),
  ('personal_finance',     'difficulty',220, 'Лични финанси',                    'Personal Finance'),
  ('other_topic',          'difficulty',999, 'Друго',                            'Other');

alter table public.subjects enable row level security;
create policy subjects_select_all on public.subjects for select to authenticated using (true);
grant select on public.subjects to authenticated;

-- ---------------------------------------------------------------------------
-- Content validation (flashcards / study guides as versioned JSON blocks)
-- ---------------------------------------------------------------------------
create or replace function app_private.material_content_is_valid(p_kind public.material_kind, p_content jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
begin
  if p_kind in ('quiz', 'practice_test') then
    return p_content is null;
  end if;

  if p_content is null
     or jsonb_typeof(p_content) <> 'object'
     or (p_content ->> 'version') is distinct from '1' then
    return false;
  end if;

  if p_kind = 'flashcards' then
    if coalesce(jsonb_typeof(p_content -> 'cards'), '') <> 'array'
       or jsonb_array_length(p_content -> 'cards') > 500 then
      return false;
    end if;
    for v_item in select value from jsonb_array_elements(p_content -> 'cards') loop
      if coalesce(jsonb_typeof(v_item -> 'front'), '') <> 'string'
         or coalesce(jsonb_typeof(v_item -> 'back'), '') <> 'string'
         or char_length(btrim(v_item ->> 'front')) not between 1 and 1000
         or char_length(btrim(v_item ->> 'back')) not between 1 and 2000 then
        return false;
      end if;
    end loop;
    return true;
  end if;

  -- study_guide
  if coalesce(jsonb_typeof(p_content -> 'sections'), '') <> 'array'
     or jsonb_array_length(p_content -> 'sections') > 100 then
    return false;
  end if;
  for v_item in select value from jsonb_array_elements(p_content -> 'sections') loop
    if coalesce(jsonb_typeof(v_item -> 'heading'), '') <> 'string'
       or coalesce(jsonb_typeof(v_item -> 'body'), '') <> 'string'
       or char_length(v_item ->> 'heading') > 200
       or char_length(btrim(v_item ->> 'body')) not between 1 and 20000 then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function app_private.material_item_count(p_kind public.material_kind, p_content jsonb, p_material_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_kind in ('quiz', 'practice_test') then
      (select count(*)::integer from public.material_questions q where q.material_id = p_material_id)
    when p_kind = 'flashcards' then coalesce(jsonb_array_length(p_content -> 'cards'), 0)
    else coalesce(jsonb_array_length(p_content -> 'sections'), 0)
  end;
$$;

-- ---------------------------------------------------------------------------
-- Learning materials
-- ---------------------------------------------------------------------------
create table public.learning_materials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind public.material_kind not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  -- Language the CONTENT is written in (any language; independent of UI locale).
  language text not null default 'bg' check (language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  subject_code text not null references public.subjects (code),
  school_grade smallint check (school_grade between 1 and 12),
  cefr_level public.cefr_level,
  difficulty_level public.difficulty_level,
  status public.material_status not null default 'draft',
  visibility public.material_visibility not null default 'private',
  show_answers_after_submit boolean not null default true,
  content jsonb,
  content_version smallint not null default 1 check (content_version = 1),
  all_ages_attested_at timestamptz,
  published_at timestamptz,
  hidden_at timestamptz,
  hidden_by uuid references auth.users (id) on delete set null,
  hidden_reason text check (char_length(hidden_reason) <= 1000),
  search tsvector generated always as (
    to_tsvector('simple'::regconfig, coalesce(title, '') || ' ' || coalesce(description, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint learning_materials_one_level
    check (num_nonnulls(school_grade, cefr_level, difficulty_level) <= 1),
  constraint learning_materials_content_valid
    check (app_private.material_content_is_valid(kind, content)),
  constraint learning_materials_published_shape
    check (status <> 'published' or (visibility = 'shared' and all_ages_attested_at is not null and published_at is not null)),
  constraint learning_materials_hidden_shape
    check (status <> 'hidden' or hidden_at is not null)
);

comment on column public.learning_materials.school_grade is
  'Discovery metadata only. Never an access limit.';

create index learning_materials_owner_idx on public.learning_materials (owner_id, updated_at desc);
create index learning_materials_library_idx on public.learning_materials (published_at desc)
  where status = 'published' and visibility = 'shared';
create index learning_materials_subject_idx on public.learning_materials (subject_code);
create index learning_materials_search_idx on public.learning_materials using gin (search);

create trigger learning_materials_set_updated_at
  before update on public.learning_materials
  for each row execute function app_private.set_updated_at();

-- Suitability must match the subject's scale; it is required to publish.
create or replace function app_private.check_material_suitability()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_scheme text;
begin
  select s.level_scheme into v_scheme from public.subjects s where s.code = new.subject_code;

  if (v_scheme = 'grade' and (new.cefr_level is not null or new.difficulty_level is not null))
     or (v_scheme = 'cefr' and (new.school_grade is not null or new.difficulty_level is not null))
     or (v_scheme = 'difficulty' and (new.school_grade is not null or new.cefr_level is not null)) then
    raise exception 'suitability_mismatch' using errcode = '23514';
  end if;

  if new.status = 'published' and (
       (v_scheme = 'grade' and new.school_grade is null)
    or (v_scheme = 'cefr' and new.cefr_level is null)
    or (v_scheme = 'difficulty' and new.difficulty_level is null)) then
    raise exception 'suitability_required' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger learning_materials_check_suitability
  before insert or update on public.learning_materials
  for each row execute function app_private.check_material_suitability();

-- ---------------------------------------------------------------------------
-- Questions (student-readable) and answer keys (private schema)
-- ---------------------------------------------------------------------------
create or replace function app_private.question_options_are_valid(p_type public.question_type, p_options jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
begin
  if coalesce(jsonb_typeof(p_options), '') <> 'array' then
    return false;
  end if;

  if p_type in ('true_false', 'short_answer') then
    return jsonb_array_length(p_options) = 0;
  end if;

  if jsonb_array_length(p_options) not between 2 and 10 then
    return false;
  end if;

  for v_item in select value from jsonb_array_elements(p_options) loop
    if coalesce(jsonb_typeof(v_item -> 'id'), '') <> 'string'
       or coalesce(jsonb_typeof(v_item -> 'text'), '') <> 'string'
       or char_length(v_item ->> 'id') not between 1 and 40
       or char_length(btrim(v_item ->> 'text')) not between 1 and 500 then
      return false;
    end if;
  end loop;

  return (select count(distinct e ->> 'id') from jsonb_array_elements(p_options) e) = jsonb_array_length(p_options);
end;
$$;

create table public.material_questions (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.learning_materials (id) on delete cascade,
  position integer not null check (position >= 0),
  type public.question_type not null,
  prompt text not null check (char_length(btrim(prompt)) between 1 and 2000),
  options jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_questions_position_key unique (material_id, position) deferrable initially deferred,
  constraint material_questions_options_valid check (app_private.question_options_are_valid(type, options))
);

create trigger material_questions_set_updated_at
  before update on public.material_questions
  for each row execute function app_private.set_updated_at();

create table app_private.question_answer_keys (
  question_id uuid primary key references public.material_questions (id) on delete cascade,
  correct_option_ids text[] not null default '{}',
  correct_bool boolean,
  accepted_answers text[] not null default '{}',
  explanation text not null default '' check (char_length(explanation) <= 2000)
);

revoke all on table app_private.question_answer_keys from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS + grants (read-only over the Data API, except owner delete)
-- ---------------------------------------------------------------------------
alter table public.learning_materials enable row level security;
alter table public.material_questions enable row level security;

create policy learning_materials_select_owner on public.learning_materials
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy learning_materials_select_library on public.learning_materials
  for select to authenticated
  using (status = 'published' and visibility = 'shared');

create policy learning_materials_select_admin on public.learning_materials
  for select to authenticated
  using ((select app_private.has_role('admin')));

-- Published material must be unpublished (archived) before deletion; hidden
-- (moderated) material stays for the admin record.
create policy learning_materials_delete_owner on public.learning_materials
  for delete to authenticated
  using (owner_id = (select auth.uid()) and status not in ('published', 'hidden'));

grant select on public.learning_materials to authenticated;
grant delete on public.learning_materials to authenticated;

-- Questions are visible exactly when their material is visible to the caller.
create policy material_questions_select_visible on public.material_questions
  for select to authenticated
  using (exists (select 1 from public.learning_materials m where m.id = material_id));

grant select on public.material_questions to authenticated;

-- ---------------------------------------------------------------------------
-- Teacher write path
-- ---------------------------------------------------------------------------
create or replace function app_private.assert_answer_key_valid(
  p_type public.question_type,
  p_options jsonb,
  p_correct_option_ids text[],
  p_correct_bool boolean,
  p_accepted_answers text[],
  p_position integer
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_option_ids text[];
  v_detail text := format('question:%s', p_position);
begin
  select coalesce(array_agg(e ->> 'id'), '{}') into v_option_ids from jsonb_array_elements(p_options) e;

  if p_type = 'single_choice' and (
       cardinality(p_correct_option_ids) <> 1 or not (p_correct_option_ids <@ v_option_ids)) then
    raise exception 'invalid_answer_key' using errcode = '22023', detail = v_detail;
  elsif p_type = 'multiple_select' and (
       cardinality(p_correct_option_ids) < 1
       or not (p_correct_option_ids <@ v_option_ids)
       or cardinality(p_correct_option_ids) <> (select count(distinct x) from unnest(p_correct_option_ids) x)) then
    raise exception 'invalid_answer_key' using errcode = '22023', detail = v_detail;
  elsif p_type = 'true_false' and p_correct_bool is null then
    raise exception 'invalid_answer_key' using errcode = '22023', detail = v_detail;
  elsif p_type = 'short_answer' and (
       cardinality(p_accepted_answers) not between 1 and 20
       or exists (select 1 from unnest(p_accepted_answers) a where char_length(a) > 200)) then
    raise exception 'invalid_answer_key' using errcode = '22023', detail = v_detail;
  end if;
end;
$$;

-- Creates or updates a material (and, for quizzes/practice tests, its questions
-- and answer keys) atomically. Returns the material id.
--
-- Payload:
-- {
--   id?, kind, title, description, language, subject_code,
--   school_grade?, cefr_level?, difficulty_level?, show_answers_after_submit?,
--   content?    -- flashcards: {version:1, cards:[{front,back}]}
--               -- study_guide: {version:1, sections:[{heading,body}]}
--   questions?  -- [{id?, type, prompt, options:[{id,text}], explanation?,
--               --   answer:{correct_option_ids?, correct_bool?, accepted_answers?}}]
-- }
-- Question ids from the client are reused only if they already belong to this
-- material; otherwise a new id is generated.
create or replace function public.save_material(p_material jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_kind public.material_kind;
  v_owner uuid;
  v_status public.material_status;
  v_keep uuid[] := '{}';
  v_q jsonb;
  v_pos integer;
  v_qid uuid;
  v_type public.question_type;
  v_options jsonb;
  v_correct text[];
  v_bool boolean;
  v_accepted text[];
begin
  perform app_private.require_role('teacher');

  if coalesce(jsonb_typeof(p_material), '') <> 'object' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  v_id := nullif(p_material ->> 'id', '')::uuid;

  if v_id is null then
    v_kind := (p_material ->> 'kind')::public.material_kind;
    if v_kind is null then
      raise exception 'invalid_payload' using errcode = '22023', detail = 'kind';
    end if;

    insert into public.learning_materials (
      owner_id, kind, title, description, language, subject_code,
      school_grade, cefr_level, difficulty_level, show_answers_after_submit, content
    ) values (
      v_uid,
      v_kind,
      btrim(coalesce(p_material ->> 'title', '')),
      coalesce(p_material ->> 'description', ''),
      coalesce(nullif(p_material ->> 'language', ''), 'bg'),
      p_material ->> 'subject_code',
      (p_material ->> 'school_grade')::smallint,
      (p_material ->> 'cefr_level')::public.cefr_level,
      (p_material ->> 'difficulty_level')::public.difficulty_level,
      coalesce((p_material ->> 'show_answers_after_submit')::boolean, true),
      case when v_kind in ('flashcards', 'study_guide') then p_material -> 'content' end
    )
    returning id into v_id;
  else
    select m.owner_id, m.kind, m.status into v_owner, v_kind, v_status
    from public.learning_materials m where m.id = v_id
    for update;

    if v_owner is null or v_owner <> v_uid then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if v_status = 'hidden' then
      raise exception 'material_hidden' using errcode = '22023';
    end if;

    update public.learning_materials m set
      title = btrim(coalesce(p_material ->> 'title', '')),
      description = coalesce(p_material ->> 'description', ''),
      language = coalesce(nullif(p_material ->> 'language', ''), 'bg'),
      subject_code = p_material ->> 'subject_code',
      school_grade = (p_material ->> 'school_grade')::smallint,
      cefr_level = (p_material ->> 'cefr_level')::public.cefr_level,
      difficulty_level = (p_material ->> 'difficulty_level')::public.difficulty_level,
      show_answers_after_submit = coalesce((p_material ->> 'show_answers_after_submit')::boolean, true),
      content = case when v_kind in ('flashcards', 'study_guide') then p_material -> 'content' end
    where m.id = v_id;
  end if;

  if v_kind in ('quiz', 'practice_test') then
    if coalesce(jsonb_typeof(p_material -> 'questions'), '') <> 'array' then
      raise exception 'invalid_payload' using errcode = '22023', detail = 'questions';
    end if;
    if jsonb_array_length(p_material -> 'questions') > 200 then
      raise exception 'too_many_questions' using errcode = '22023';
    end if;

    select coalesce(array_agg(q.id), '{}') into v_keep
    from public.material_questions q
    where q.material_id = v_id
      and q.id in (
        select nullif(e ->> 'id', '')::uuid from jsonb_array_elements(p_material -> 'questions') e
      );

    delete from public.material_questions q
    where q.material_id = v_id and not (q.id = any (v_keep));

    for v_q, v_pos in
      select e, (o - 1)::integer from jsonb_array_elements(p_material -> 'questions') with ordinality as t (e, o)
    loop
      v_type := (v_q ->> 'type')::public.question_type;
      if v_type is null then
        raise exception 'invalid_payload' using errcode = '22023', detail = format('question:%s', v_pos);
      end if;
      v_qid := nullif(v_q ->> 'id', '')::uuid;
      v_options := case when v_type in ('single_choice', 'multiple_select')
                        then coalesce(v_q -> 'options', '[]'::jsonb) else '[]'::jsonb end;
      v_correct := array(select jsonb_array_elements_text(coalesce(v_q -> 'answer' -> 'correct_option_ids', '[]'::jsonb)));
      v_bool := (v_q -> 'answer' ->> 'correct_bool')::boolean;
      v_accepted := array(
        select btrim(a) from jsonb_array_elements_text(coalesce(v_q -> 'answer' -> 'accepted_answers', '[]'::jsonb)) a
        where btrim(a) <> ''
      );

      perform app_private.assert_answer_key_valid(v_type, v_options, v_correct, v_bool, v_accepted, v_pos);

      if v_qid is not null and v_qid = any (v_keep) then
        update public.material_questions q set
          position = v_pos, type = v_type, prompt = btrim(coalesce(v_q ->> 'prompt', '')), options = v_options
        where q.id = v_qid;
      else
        insert into public.material_questions (material_id, position, type, prompt, options)
        values (v_id, v_pos, v_type, btrim(coalesce(v_q ->> 'prompt', '')), v_options)
        returning id into v_qid;
      end if;

      insert into app_private.question_answer_keys as k (question_id, correct_option_ids, correct_bool, accepted_answers, explanation)
      values (
        v_qid,
        case when v_type in ('single_choice', 'multiple_select') then v_correct else '{}' end,
        case when v_type = 'true_false' then v_bool end,
        case when v_type = 'short_answer' then v_accepted else '{}' end,
        coalesce(v_q ->> 'explanation', '')
      )
      on conflict (question_id) do update set
        correct_option_ids = excluded.correct_option_ids,
        correct_bool = excluded.correct_bool,
        accepted_answers = excluded.accepted_answers,
        explanation = excluded.explanation;
    end loop;
  elsif coalesce(jsonb_array_length(case when jsonb_typeof(p_material -> 'questions') = 'array'
                                         then p_material -> 'questions' end), 0) > 0 then
    raise exception 'questions_not_allowed' using errcode = '22023';
  end if;

  return v_id;
end;
$$;

-- Owner-only read of a material including answer keys, for the editor.
create or replace function public.get_material_for_edit(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_material public.learning_materials;
begin
  select * into v_material from public.learning_materials m where m.id = p_id;
  if not found or v_material.owner_id <> (select auth.uid()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return (to_jsonb(v_material) - 'search' - 'hidden_by') || jsonb_build_object(
    'questions',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'type', q.type,
          'prompt', q.prompt,
          'options', q.options,
          'explanation', coalesce(k.explanation, ''),
          'answer', jsonb_build_object(
            'correct_option_ids', to_jsonb(coalesce(k.correct_option_ids, '{}')),
            'correct_bool', k.correct_bool,
            'accepted_answers', to_jsonb(coalesce(k.accepted_answers, '{}'))
          )
        ) order by q.position
      )
      from public.material_questions q
      left join app_private.question_answer_keys k on k.question_id = q.id
      where q.material_id = p_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.publish_material(p_id uuid, p_attest_all_ages boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_material public.learning_materials;
begin
  perform app_private.require_role('teacher');

  select * into v_material from public.learning_materials m where m.id = p_id for update;
  if not found or v_material.owner_id <> (select auth.uid()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_material.status not in ('draft', 'archived') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if not coalesce(p_attest_all_ages, false) then
    raise exception 'attestation_required' using errcode = '22023';
  end if;
  if app_private.material_item_count(v_material.kind, v_material.content, v_material.id) = 0 then
    raise exception 'empty_material' using errcode = '22023';
  end if;

  update public.learning_materials m set
    status = 'published',
    visibility = 'shared',
    published_at = now(),
    all_ages_attested_at = now()
  where m.id = p_id;
end;
$$;

create or replace function public.unpublish_material(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_material public.learning_materials;
begin
  select * into v_material from public.learning_materials m where m.id = p_id for update;
  if not found or v_material.owner_id <> (select auth.uid()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_material.status <> 'published' then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  update public.learning_materials m set status = 'archived', visibility = 'private'
  where m.id = p_id;
end;
$$;

revoke all on function public.save_material(jsonb) from public, anon;
revoke all on function public.get_material_for_edit(uuid) from public, anon;
revoke all on function public.publish_material(uuid, boolean) from public, anon;
revoke all on function public.unpublish_material(uuid) from public, anon;
grant execute on function public.save_material(jsonb) to authenticated;
grant execute on function public.get_material_for_edit(uuid) to authenticated;
grant execute on function public.publish_material(uuid, boolean) to authenticated;
grant execute on function public.unpublish_material(uuid) to authenticated;

grant execute on function app_private.material_content_is_valid(public.material_kind, jsonb) to authenticated, service_role;
grant execute on function app_private.question_options_are_valid(public.question_type, jsonb) to authenticated, service_role;
grant execute on function app_private.material_item_count(public.material_kind, jsonb, uuid) to authenticated, service_role;
