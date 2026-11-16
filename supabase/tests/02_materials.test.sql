-- Materials: ownership, publication, answer-key privacy, moderation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, email) values
  ('20000000-0000-4000-a000-000000000001', 's1@test.local'),
  ('20000000-0000-4000-a000-000000000011', 't1@test.local'),
  ('20000000-0000-4000-a000-000000000012', 't2@test.local'),
  ('20000000-0000-4000-a000-000000000021', 'a1@test.local');
insert into public.user_roles (user_id, role) values
  ('20000000-0000-4000-a000-000000000011', 'teacher'),
  ('20000000-0000-4000-a000-000000000012', 'teacher'),
  ('20000000-0000-4000-a000-000000000021', 'admin');

-- ---------------------------------------------------------------- student cannot author
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-a000-000000000001"}', true);
select throws_ok(
  $$select public.save_material('{"kind":"quiz","title":"x","subject_code":"mathematics","questions":[]}')$$,
  '42501', null, 'students cannot create materials');
select throws_ok(
  $$insert into public.learning_materials (owner_id, kind, title, subject_code) values (auth.uid(), 'quiz', 'x', 'mathematics')$$,
  '42501', null, 'no direct inserts into learning_materials');

-- ---------------------------------------------------------------- teacher 1 creates a draft quiz
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-a000-000000000011"}', true);
select set_config('test.quiz_id', public.save_material($json${
  "kind": "quiz", "title": "Fractions", "subject_code": "mathematics",
  "questions": [
    {"type": "single_choice", "prompt": "1/2 + 1/4?",
     "options": [{"id": "a", "text": "3/4"}, {"id": "b", "text": "2/6"}],
     "answer": {"correct_option_ids": ["a"]}, "explanation": "Common denominator."},
    {"type": "true_false", "prompt": "1/2 > 1/3", "answer": {"correct_bool": true}}
  ]
}$json$::jsonb)::text, true);

select results_eq(
  $$select count(*) from public.material_questions where material_id = current_setting('test.quiz_id')::uuid$$,
  array[2::bigint], 'owner sees draft questions');
select is(
  public.get_material_for_edit(current_setting('test.quiz_id')::uuid) -> 'questions' -> 0 -> 'answer' -> 'correct_option_ids',
  '["a"]'::jsonb, 'owner can read answer keys in the editor payload');
select throws_ok(
  $$select public.save_material('{"kind":"quiz","title":"bad","subject_code":"mathematics","questions":[{"type":"single_choice","prompt":"?","options":[{"id":"a","text":"A"},{"id":"b","text":"B"}],"answer":{"correct_option_ids":["z"]}}]}')$$,
  '22023', null, 'answer key must reference an existing option');
select throws_ok(
  $$select public.save_material('{"kind":"quiz","title":"bad","subject_code":"english","school_grade":5,"questions":[]}')$$,
  '23514', null, 'English cannot carry a school grade (CEFR only)');
select throws_ok(
  $$select public.save_material('{"kind":"flashcards","title":"bad","subject_code":"programming","content":{"version":1,"cards":[{"front":"","back":"x"}]}}')$$,
  '23514', null, 'flashcard content shape is validated');
select throws_ok(
  $$select public.publish_material(current_setting('test.quiz_id')::uuid, false)$$,
  '22023', null, 'publishing requires the all-ages attestation');
select throws_ok(
  $$select public.publish_material(current_setting('test.quiz_id')::uuid, true)$$,
  '23514', null, 'publishing requires a suitability level for the subject');

-- ---------------------------------------------------------------- student cannot see drafts
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-a000-000000000001"}', true);
select is_empty(
  $$select 1 from public.learning_materials where id = current_setting('test.quiz_id')::uuid$$,
  'students cannot see drafts');
select is_empty(
  $$select 1 from public.material_questions where material_id = current_setting('test.quiz_id')::uuid$$,
  'students cannot see draft questions');

-- ---------------------------------------------------------------- teacher fixes level and publishes
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-a000-000000000011"}', true);
select lives_ok(
  format($$select public.save_material(jsonb_set(public.get_material_for_edit(%L) - 'school_grade', '{school_grade}', '6'))$$,
         current_setting('test.quiz_id')),
  'teacher can update their own material (round-trip of the editor payload)');
select results_eq(
  $$select count(*) from public.material_questions where material_id = current_setting('test.quiz_id')::uuid$$,
  array[2::bigint], 'round-trip save keeps question ids stable');
select lives_ok(
  $$select public.publish_material(current_setting('test.quiz_id')::uuid, true)$$,
  'teacher can publish with attestation');
delete from public.learning_materials where id = current_setting('test.quiz_id')::uuid;

-- ---------------------------------------------------------------- student reads published content, not keys
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-a000-000000000001"}', true);
select results_eq(
  $$select count(*) from public.material_questions where material_id = current_setting('test.quiz_id')::uuid$$,
  array[2::bigint], 'students can read published questions');
select throws_ok(
  $$select * from app_private.question_answer_keys$$,
  '42501', null, 'students cannot read answer keys');
select throws_ok(
  $$select public.get_material_for_edit(current_setting('test.quiz_id')::uuid)$$,
  'P0002', null, 'students cannot open the editor payload');
select throws_ok(
  $$update public.learning_materials set title = 'pwned' where id = current_setting('test.quiz_id')::uuid$$,
  '42501', null, 'no direct updates to materials');

-- ---------------------------------------------------------------- teacher 2 cannot touch teacher 1 material
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-a000-000000000012"}', true);
select throws_ok(
  format($$select public.save_material('{"id":"%s","kind":"quiz","title":"x","subject_code":"mathematics","questions":[]}')$$,
         current_setting('test.quiz_id')),
  'P0002', null, 'another teacher cannot edit the material');
select throws_ok(
  $$select public.unpublish_material(current_setting('test.quiz_id')::uuid)$$,
  'P0002', null, 'another teacher cannot unpublish the material');

-- ---------------------------------------------------------------- admin hides it
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-a000-000000000021"}', true);
select lives_ok(
  $$select public.moderate_material(current_setting('test.quiz_id')::uuid, 'hide', 'test')$$,
  'admin can hide material');

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-a000-000000000001"}', true);
select is_empty(
  $$select 1 from public.learning_materials where id = current_setting('test.quiz_id')::uuid$$,
  'hidden material disappears from the library');
select throws_ok(
  $$select public.moderate_material(current_setting('test.quiz_id')::uuid, 'restore')$$,
  '42501', null, 'students cannot moderate');

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-a000-000000000011"}', true);
select throws_ok(
  $$select public.publish_material(current_setting('test.quiz_id')::uuid, true)$$,
  '22023', null, 'teacher cannot republish hidden material');
select throws_ok(
  $$select public.save_material(public.get_material_for_edit(current_setting('test.quiz_id')::uuid))$$,
  '22023', null, 'teacher cannot edit hidden material');

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-a000-000000000021"}', true);
select lives_ok(
  $$select public.moderate_material(current_setting('test.quiz_id')::uuid, 'restore')$$,
  'admin can restore hidden material');

-- ---------------------------------------------------------------- verify as postgres
reset role;
select is(
  (select status::text from public.learning_materials where id = current_setting('test.quiz_id')::uuid),
  'archived', 'restored material returns to the teacher as archived (re-attestation needed)');
select ok(
  exists (select 1 from public.learning_materials where id = current_setting('test.quiz_id')::uuid),
  'owner could not delete the material while it was published');

select * from finish();
rollback;
