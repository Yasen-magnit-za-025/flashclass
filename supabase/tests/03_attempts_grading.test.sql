-- Attempts and server-side grading.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email) values
  ('30000000-0000-4000-a000-000000000001', 's1@test.local'),
  ('30000000-0000-4000-a000-000000000002', 's2@test.local'),
  ('30000000-0000-4000-a000-000000000011', 't1@test.local');
insert into public.user_roles (user_id, role) values ('30000000-0000-4000-a000-000000000011', 'teacher');

-- Normalization (pure function, as postgres).
select is(app_private.normalize_answer('  ПАРИЖ.  '), 'париж', 'short answers are trimmed, case-folded (Cyrillic) and stripped of edge punctuation');
select is(app_private.normalize_answer('is   raining'), 'is raining', 'internal whitespace is collapsed');

-- Teacher publishes a 4-question quiz, a hidden-answers quiz and a flashcard set.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-a000-000000000011"}', true);
select set_config('test.quiz', public.save_material($json${
  "kind": "quiz", "title": "Mixed", "subject_code": "general_knowledge", "difficulty_level": "beginner",
  "questions": [
    {"type": "single_choice", "prompt": "Q1", "options": [{"id": "a", "text": "A"}, {"id": "b", "text": "B"}], "answer": {"correct_option_ids": ["b"]}},
    {"type": "multiple_select", "prompt": "Q2", "options": [{"id": "a", "text": "A"}, {"id": "b", "text": "B"}, {"id": "c", "text": "C"}], "answer": {"correct_option_ids": ["a", "c"]}},
    {"type": "true_false", "prompt": "Q3", "answer": {"correct_bool": false}},
    {"type": "short_answer", "prompt": "Q4", "answer": {"accepted_answers": ["Париж"]}}
  ]
}$json$::jsonb)::text, true);
select public.publish_material(current_setting('test.quiz')::uuid, true);

select set_config('test.secret', public.save_material($json${
  "kind": "practice_test", "title": "No reveal", "subject_code": "general_knowledge", "difficulty_level": "beginner",
  "show_answers_after_submit": false,
  "questions": [{"type": "true_false", "prompt": "Q", "answer": {"correct_bool": true}}]
}$json$::jsonb)::text, true);
select public.publish_material(current_setting('test.secret')::uuid, true);

select set_config('test.cards', public.save_material($json${
  "kind": "flashcards", "title": "Cards", "subject_code": "general_knowledge", "difficulty_level": "beginner",
  "content": {"version": 1, "cards": [{"front": "a", "back": "b"}]}
}$json$::jsonb)::text, true);
select public.publish_material(current_setting('test.cards')::uuid, true);

select set_config('test.draft', public.save_material(
  '{"kind":"quiz","title":"Draft","subject_code":"general_knowledge","questions":[{"type":"true_false","prompt":"Q","answer":{"correct_bool":true}}]}'
)::text, true);

-- Question ids, in position order.
reset role;
select set_config('test.q', (
  select jsonb_agg(id order by position)::text from public.material_questions
  where material_id = current_setting('test.quiz')::uuid
), true);

-- ---------------------------------------------------------------- student 1
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-a000-000000000001"}', true);

select set_config('test.attempt', public.start_attempt(current_setting('test.quiz')::uuid)::text, true);
select is(public.start_attempt(current_setting('test.quiz')::uuid)::text, current_setting('test.attempt'),
  'starting again resumes the open attempt');
select throws_ok(
  $$insert into public.quiz_attempts (user_id, material_id, material_title, status, submitted_at, question_count, correct_count, score_percent)
    values (auth.uid(), current_setting('test.quiz')::uuid, 'x', 'submitted', now(), 4, 4, 100)$$,
  '42501', null, 'students cannot insert forged attempts');
select throws_ok(
  $$select public.start_attempt(current_setting('test.draft')::uuid)$$,
  'P0002', null, 'cannot attempt another teacher''s draft');
select throws_ok(
  $$select public.start_attempt(current_setting('test.cards')::uuid)$$,
  '22023', null, 'flashcards are not attemptable');
select throws_ok(
  $$select public.submit_attempt(current_setting('test.attempt')::uuid,
      jsonb_build_array(jsonb_build_object('question_id', gen_random_uuid(), 'response', '{}'::jsonb)))$$,
  '22023', null, 'foreign question ids are rejected');
select throws_ok(
  $$select public.submit_attempt(current_setting('test.attempt')::uuid, jsonb_build_array(
      jsonb_build_object('question_id', current_setting('test.q')::jsonb ->> 0, 'response', '{"option_id":"b"}'::jsonb),
      jsonb_build_object('question_id', current_setting('test.q')::jsonb ->> 0, 'response', '{"option_id":"a"}'::jsonb)))$$,
  '22023', null, 'duplicate answers are rejected');

select set_config('test.result', public.submit_attempt(current_setting('test.attempt')::uuid, jsonb_build_array(
  jsonb_build_object('question_id', current_setting('test.q')::jsonb ->> 0, 'response', '{"option_id":"b"}'::jsonb),
  jsonb_build_object('question_id', current_setting('test.q')::jsonb ->> 1, 'response', '{"option_ids":["c","a"]}'::jsonb),
  jsonb_build_object('question_id', current_setting('test.q')::jsonb ->> 2, 'response', '{"value":false}'::jsonb),
  -- Forged score fields inside an answer are ignored by construction.
  jsonb_build_object('question_id', current_setting('test.q')::jsonb ->> 3, 'response', '{"text":"  париж "}'::jsonb, 'score_percent', 100)
))::text, true);

select is((current_setting('test.result')::jsonb ->> 'score_percent')::numeric, 100.00, 'all-correct submission scores 100');
select is((current_setting('test.result')::jsonb ->> 'answers_revealed')::boolean, true, 'answers are revealed when the material allows it');
select throws_ok(
  $$select public.submit_attempt(current_setting('test.attempt')::uuid, '[]')$$,
  '22023', null, 'an attempt can only be submitted once');
select throws_ok(
  $$update public.quiz_attempts set score_percent = 0 where id = current_setting('test.attempt')::uuid$$,
  '42501', null, 'students cannot edit scores');

-- Partial attempt: one correct, rest unanswered.
select set_config('test.attempt2', public.start_attempt(current_setting('test.quiz')::uuid)::text, true);
select is(
  (public.submit_attempt(current_setting('test.attempt2')::uuid, jsonb_build_array(
    jsonb_build_object('question_id', current_setting('test.q')::jsonb ->> 2, 'response', '{"value":false}'::jsonb)
  )) ->> 'score_percent')::numeric,
  25.00, 'unanswered questions count as incorrect');

select set_config('test.attempt3', public.start_attempt(current_setting('test.secret')::uuid)::text, true);
select ok(
  (public.submit_attempt(current_setting('test.attempt3')::uuid, '[]') -> 'answers' -> 0 -> 'correct') is null,
  'correct answers stay hidden when the material disables reveal');

select results_eq($$select count(*) from public.quiz_attempts$$, array[3::bigint], 'student sees their own attempts');

-- ---------------------------------------------------------------- student 2
select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-a000-000000000002"}', true);
select is_empty($$select 1 from public.quiz_attempts$$, 'students cannot see others'' attempts');
select is_empty($$select 1 from public.attempt_answers$$, 'students cannot see others'' answers');
select throws_ok(
  $$select public.get_attempt_result(current_setting('test.attempt')::uuid)$$,
  'P0002', null, 'students cannot read others'' results');

-- ---------------------------------------------------------------- history survives deletion
reset role;
delete from public.learning_materials where id = current_setting('test.quiz')::uuid;
select is(
  (select material_title from public.quiz_attempts where id = current_setting('test.attempt')::uuid),
  'Mixed', 'attempt history survives material deletion');

select * from finish();
rollback;
