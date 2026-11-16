-- Quiz / practice-test attempts and server-side grading.
--
-- Students can only READ their own attempts and answers over the Data API.
-- Attempts are created by start_attempt and graded by submit_attempt, which read
-- the private answer keys. Score columns are never client-writable.
-- Attempt history survives deletion of the material (material_id set null,
-- title snapshotted).

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  material_id uuid references public.learning_materials (id) on delete set null,
  material_title text not null,
  status public.attempt_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  question_count integer check (question_count >= 0),
  correct_count integer check (correct_count >= 0),
  score_percent numeric(5, 2) check (score_percent between 0 and 100),
  constraint quiz_attempts_submitted_shape check (
    (status = 'submitted') = (
      submitted_at is not null and question_count is not null
      and correct_count is not null and score_percent is not null
    )
  ),
  constraint quiz_attempts_correct_le_total check (correct_count <= question_count)
);

create index quiz_attempts_user_idx on public.quiz_attempts (user_id, started_at desc);
create index quiz_attempts_material_idx on public.quiz_attempts (material_id);
create unique index quiz_attempts_one_open_idx on public.quiz_attempts (user_id, material_id)
  where status = 'in_progress';

create table public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts (id) on delete cascade,
  question_id uuid references public.material_questions (id) on delete set null,
  position integer not null,
  response jsonb not null default '{}'::jsonb,
  is_correct boolean not null,
  constraint attempt_answers_question_key unique (attempt_id, question_id),
  constraint attempt_answers_position_key unique (attempt_id, position)
);

create index attempt_answers_question_idx on public.attempt_answers (question_id);

alter table public.quiz_attempts enable row level security;
alter table public.attempt_answers enable row level security;

create policy quiz_attempts_select_own on public.quiz_attempts
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy attempt_answers_select_own on public.attempt_answers
  for select to authenticated
  using (exists (
    select 1 from public.quiz_attempts a
    where a.id = attempt_id and a.user_id = (select auth.uid())
  ));

grant select on public.quiz_attempts to authenticated;
grant select on public.attempt_answers to authenticated;

-- ---------------------------------------------------------------------------
-- Grading helpers
-- ---------------------------------------------------------------------------

-- Deterministic short-answer normalization: Unicode NFKC, case-folded with ICU
-- (correct for Cyrillic), whitespace collapsed, leading/trailing punctuation
-- stripped. No semantic matching: equivalent wording may not match.
create or replace function app_private.normalize_answer(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(
      lower((normalize(coalesce(p_text, ''), NFKC)) collate "und-x-icu"),
      '\s+', ' ', 'g'
    ),
    '^[[:punct:][:space:]]+|[[:punct:][:space:]]+$', '', 'g'
  );
$$;

-- Response shapes:
--   single_choice   {"option_id": "a"}
--   multiple_select {"option_ids": ["a","c"]}
--   true_false      {"value": true}
--   short_answer    {"text": "..."}
create or replace function app_private.response_is_correct(
  p_type public.question_type,
  p_key app_private.question_answer_keys,
  p_response jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_given text[];
  v_expected text[];
  v_text text;
begin
  if p_key is null or p_response is null or jsonb_typeof(p_response) <> 'object' then
    return false;
  end if;

  case p_type
    when 'single_choice' then
      return coalesce(jsonb_typeof(p_response -> 'option_id'), '') = 'string'
         and array[p_response ->> 'option_id'] = p_key.correct_option_ids;

    when 'multiple_select' then
      if coalesce(jsonb_typeof(p_response -> 'option_ids'), '') <> 'array' then
        return false;
      end if;
      select coalesce(array_agg(distinct x order by x), '{}') into v_given
      from jsonb_array_elements_text(p_response -> 'option_ids') x;
      select coalesce(array_agg(distinct y order by y), '{}') into v_expected
      from unnest(p_key.correct_option_ids) y;
      return cardinality(v_expected) > 0 and v_given = v_expected;

    when 'true_false' then
      return coalesce(jsonb_typeof(p_response -> 'value'), '') = 'boolean'
         and (p_response ->> 'value')::boolean = p_key.correct_bool;

    when 'short_answer' then
      v_text := app_private.normalize_answer(p_response ->> 'text');
      return v_text <> '' and exists (
        select 1 from unnest(p_key.accepted_answers) a
        where app_private.normalize_answer(a) = v_text
      );
  end case;

  return false;
end;
$$;

-- Builds the result payload for a submitted attempt. Correct answers and
-- explanations are revealed only if the material allows it (or the viewer owns
-- the material).
create or replace function app_private.attempt_result(p_attempt_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with a as (
    select qa.*, m.show_answers_after_submit, m.owner_id as material_owner_id
    from public.quiz_attempts qa
    left join public.learning_materials m on m.id = qa.material_id
    where qa.id = p_attempt_id
  ), reveal as (
    select coalesce(a.show_answers_after_submit or a.material_owner_id = (select auth.uid()), false) as ok from a
  )
  select jsonb_build_object(
    'attempt_id', a.id,
    'material_id', a.material_id,
    'material_title', a.material_title,
    'submitted_at', a.submitted_at,
    'question_count', a.question_count,
    'correct_count', a.correct_count,
    'score_percent', a.score_percent,
    'answers_revealed', (select ok from reveal),
    'answers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'question_id', aa.question_id,
          'position', aa.position,
          'type', q.type,
          'prompt', q.prompt,
          'options', q.options,
          'response', aa.response,
          'is_correct', aa.is_correct
        ) || case when (select ok from reveal) and k.question_id is not null then jsonb_build_object(
          'correct', jsonb_build_object(
            'correct_option_ids', to_jsonb(k.correct_option_ids),
            'correct_bool', k.correct_bool,
            'accepted_answers', to_jsonb(k.accepted_answers)
          ),
          'explanation', k.explanation
        ) else '{}'::jsonb end
        order by aa.position
      )
      from public.attempt_answers aa
      left join public.material_questions q on q.id = aa.question_id
      left join app_private.question_answer_keys k on k.question_id = aa.question_id
      where aa.attempt_id = a.id
    ), '[]'::jsonb)
  )
  from a;
$$;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

-- Starts (or resumes) an attempt on a visible quiz / practice test.
create or replace function public.start_attempt(p_material_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_material public.learning_materials;
  v_attempt_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_material from public.learning_materials m where m.id = p_material_id;
  if not found
     or v_material.status = 'hidden'
     or not ((v_material.status = 'published' and v_material.visibility = 'shared') or v_material.owner_id = v_uid) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_material.kind not in ('quiz', 'practice_test') then
    raise exception 'not_a_quiz' using errcode = '22023';
  end if;
  if not exists (select 1 from public.material_questions q where q.material_id = v_material.id) then
    raise exception 'empty_material' using errcode = '22023';
  end if;

  select a.id into v_attempt_id
  from public.quiz_attempts a
  where a.user_id = v_uid and a.material_id = v_material.id and a.status = 'in_progress';

  if v_attempt_id is null then
    insert into public.quiz_attempts (user_id, material_id, material_title)
    values (v_uid, v_material.id, v_material.title)
    returning id into v_attempt_id;
  end if;

  return v_attempt_id;
end;
$$;

-- Grades an attempt from the private answer keys. p_answers:
--   [{"question_id": uuid, "response": {...}}, ...]
-- Unanswered questions count as incorrect. Foreign or duplicate question ids
-- are rejected. Any score fields in the payload are ignored by construction.
create or replace function public.submit_attempt(p_attempt_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_attempt public.quiz_attempts;
  v_material public.learning_materials;
  v_total integer;
  v_correct integer;
begin
  select * into v_attempt from public.quiz_attempts a where a.id = p_attempt_id for update;
  if not found or v_attempt.user_id <> v_uid then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_attempt.status <> 'in_progress' then
    raise exception 'already_submitted' using errcode = '22023';
  end if;

  select * into v_material from public.learning_materials m where m.id = v_attempt.material_id;
  if not found
     or v_material.status = 'hidden'
     or not (v_material.status = 'published' or v_material.owner_id = v_uid) then
    raise exception 'material_unavailable' using errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(p_answers), '') <> 'array' or jsonb_array_length(p_answers) > 500 then
    raise exception 'invalid_answers' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_answers) e
    where coalesce(jsonb_typeof(e), '') <> 'object'
       or coalesce(jsonb_typeof(e -> 'question_id'), '') <> 'string'
  ) then
    raise exception 'invalid_answers' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_answers) e
    where not exists (
      select 1 from public.material_questions q
      where q.id = (e ->> 'question_id')::uuid and q.material_id = v_material.id
    )
  ) then
    raise exception 'foreign_question' using errcode = '22023';
  end if;

  if (select count(*) from jsonb_array_elements(p_answers))
     <> (select count(distinct e ->> 'question_id') from jsonb_array_elements(p_answers) e) then
    raise exception 'duplicate_question' using errcode = '22023';
  end if;

  insert into public.attempt_answers (attempt_id, question_id, position, response, is_correct)
  select
    v_attempt.id,
    q.id,
    q.position,
    coalesce(r.response, '{}'::jsonb),
    coalesce(app_private.response_is_correct(q.type, k, r.response), false)
  from public.material_questions q
  left join app_private.question_answer_keys k on k.question_id = q.id
  left join lateral (
    select e -> 'response' as response
    from jsonb_array_elements(p_answers) e
    where (e ->> 'question_id')::uuid = q.id
  ) r on true
  where q.material_id = v_material.id;

  select count(*)::integer, (count(*) filter (where aa.is_correct))::integer
  into v_total, v_correct
  from public.attempt_answers aa
  where aa.attempt_id = v_attempt.id;

  update public.quiz_attempts a set
    status = 'submitted',
    submitted_at = now(),
    material_title = v_material.title,
    question_count = v_total,
    correct_count = v_correct,
    score_percent = case when v_total = 0 then 0 else round(100.0 * v_correct / v_total, 2) end
  where a.id = v_attempt.id;

  return app_private.attempt_result(v_attempt.id);
end;
$$;

create or replace function public.get_attempt_result(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.quiz_attempts a
    where a.id = p_attempt_id and a.user_id = (select auth.uid()) and a.status = 'submitted'
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return app_private.attempt_result(p_attempt_id);
end;
$$;

revoke all on function public.start_attempt(uuid) from public, anon;
revoke all on function public.submit_attempt(uuid, jsonb) from public, anon;
revoke all on function public.get_attempt_result(uuid) from public, anon;
grant execute on function public.start_attempt(uuid) to authenticated;
grant execute on function public.submit_attempt(uuid, jsonb) to authenticated;
grant execute on function public.get_attempt_result(uuid) to authenticated;
