-- Library search, bookmarks and reports.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email) values
  ('40000000-0000-4000-a000-000000000001', 's1@test.local'),
  ('40000000-0000-4000-a000-000000000002', 's2@test.local'),
  ('40000000-0000-4000-a000-000000000011', 't1@test.local'),
  ('40000000-0000-4000-a000-000000000021', 'a1@test.local');
insert into public.user_roles (user_id, role) values
  ('40000000-0000-4000-a000-000000000011', 'teacher'),
  ('40000000-0000-4000-a000-000000000021', 'admin');
update public.profiles set grade_preference = '3' where user_id = '40000000-0000-4000-a000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-a000-000000000011"}', true);
select set_config('test.g10', public.save_material(
  '{"kind":"study_guide","title":"Grade ten guide","subject_code":"physics","school_grade":10,"content":{"version":1,"sections":[{"heading":"h","body":"b"}]}}'
)::text, true);
select public.publish_material(current_setting('test.g10')::uuid, true);
select set_config('test.g4', public.save_material(
  '{"kind":"study_guide","title":"Grade four guide","subject_code":"physics","school_grade":4,"content":{"version":1,"sections":[{"heading":"h","body":"b"}]}}'
)::text, true);
select public.publish_material(current_setting('test.g4')::uuid, true);
select set_config('test.draft', public.save_material(
  '{"kind":"study_guide","title":"Secret draft guide","subject_code":"physics","content":{"version":1,"sections":[]}}'
)::text, true);

-- ---------------------------------------------------------------- student 1 (grade preference 3)
select set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-a000-000000000001"}', true);

select results_eq(
  $$select count(*) from public.search_library(p_query => 'guide')$$,
  array[2::bigint], 'search returns published materials only');
select results_eq(
  $$select id::text from public.search_library(p_subject => 'physics') limit 1$$,
  array[current_setting('test.g4')], 'closest grade to the preference ranks first');
select results_eq(
  $$select count(*) from public.search_library(p_school_grade => 10::smallint)$$,
  array[1::bigint], 'higher-grade content stays accessible regardless of preference');
select results_eq(
  $$select author_name from public.search_library(p_subject => 'physics') limit 1$$,
  array['t1'], 'search includes the teacher author name');

select lives_ok(
  $$insert into public.saved_materials (material_id) values (current_setting('test.g10')::uuid)$$,
  'student can bookmark published material');
select throws_ok(
  $$insert into public.saved_materials (material_id) values (current_setting('test.draft')::uuid)$$,
  '42501', null, 'student cannot bookmark a draft');
select throws_ok(
  $$insert into public.saved_materials (user_id, material_id) values ('40000000-0000-4000-a000-000000000002', current_setting('test.g4')::uuid)$$,
  '42501', null, 'student cannot bookmark on behalf of someone else');
select results_eq(
  $$select count(*) from public.search_library(p_saved_only => true)$$,
  array[1::bigint], 'saved-only search returns bookmarks');

select lives_ok(
  $$insert into public.material_reports (material_id, reason, details) values (current_setting('test.g10')::uuid, 'incorrect', 'typo')$$,
  'student can report published material');
select throws_ok(
  $$insert into public.material_reports (material_id, reason) values (current_setting('test.g10')::uuid, 'spam')$$,
  '23505', null, 'one open report per student and material');
select throws_ok(
  $$insert into public.material_reports (material_id, reason) values (current_setting('test.draft')::uuid, 'spam')$$,
  '42501', null, 'cannot report invisible material');

update public.material_reports set status = 'dismissed';

-- ---------------------------------------------------------------- student 2
select set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-a000-000000000002"}', true);
select is_empty($$select 1 from public.saved_materials$$, 'bookmarks are private');
select is_empty($$select 1 from public.material_reports$$, 'reports are private to the reporter');

-- ---------------------------------------------------------------- admin
select set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-a000-000000000021"}', true);
select results_eq(
  $$select status::text from public.material_reports$$,
  array['open'], 'student could not change report status; admin sees the report');
select lives_ok(
  $$update public.material_reports set status = 'resolved', resolution_note = 'fixed'$$,
  'admin can resolve reports');
select ok(
  (select resolved_at is not null and resolved_by = auth.uid() from public.material_reports),
  'resolution is stamped with time and admin');

select * from finish();
rollback;
