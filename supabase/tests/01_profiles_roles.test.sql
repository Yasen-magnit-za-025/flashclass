-- Profiles, roles, admin role management. Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Fixtures (as postgres). Student 1 tries to self-promote through metadata.
insert into auth.users (id, email, raw_user_meta_data) values
  ('10000000-0000-4000-a000-000000000001', 's1@test.local', '{"display_name":"Иван","role":"admin","ui_locale":"en"}'),
  ('10000000-0000-4000-a000-000000000002', 's2@test.local', '{}'),
  ('10000000-0000-4000-a000-000000000011', 't1@test.local', '{"display_name":"Teacher One"}'),
  ('10000000-0000-4000-a000-000000000021', 'a1@test.local', '{"display_name":"Admin"}');
insert into public.user_roles (user_id, role) values
  ('10000000-0000-4000-a000-000000000011', 'teacher'),
  ('10000000-0000-4000-a000-000000000021', 'admin');

select is(
  (select display_name from public.profiles where user_id = '10000000-0000-4000-a000-000000000001'),
  'Иван', 'signup creates a profile with the metadata display name (Cyrillic)');
select is(
  (select ui_locale::text from public.profiles where user_id = '10000000-0000-4000-a000-000000000001'),
  'en', 'signup stores a valid UI locale');
select is(
  (select display_name from public.profiles where user_id = '10000000-0000-4000-a000-000000000002'),
  's2', 'missing display name falls back to the email local part');
select results_eq(
  $$select role::text from public.user_roles where user_id = '10000000-0000-4000-a000-000000000001'$$,
  array['student'], 'signup grants only student, ignoring a requested role in metadata');

-- ---------------------------------------------------------------- student 1
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-a000-000000000001","role":"authenticated"}', true);

select results_eq($$select count(*) from public.profiles$$, array[1::bigint], 'student sees only their own profile');
select results_eq($$select count(*) from public.user_roles$$, array[1::bigint], 'student sees only their own roles');

select lives_ok(
  $$update public.profiles set grade_preference = '7', display_name = 'Иван П.' where user_id = auth.uid()$$,
  'student can update their own profile');
select throws_ok(
  $$update public.profiles set grade_preference = '13' where user_id = auth.uid()$$,
  '23514', null, 'grade preference must be 1-12 or other');
select throws_ok(
  $$update public.profiles set user_id = '10000000-0000-4000-a000-000000000002' where user_id = auth.uid()$$,
  '42501', null, 'student cannot change profile ownership');

update public.profiles set display_name = 'hacked' where user_id = '10000000-0000-4000-a000-000000000002';

select throws_ok(
  $$insert into public.user_roles (user_id, role) values (auth.uid(), 'teacher')$$,
  '42501', null, 'student cannot grant themselves a role');
select throws_ok(
  $$update public.user_roles set role = 'admin' where user_id = auth.uid()$$,
  '42501', null, 'student cannot rewrite their role');
select throws_ok(
  $$select public.admin_set_role(auth.uid(), 'admin', true)$$,
  '42501', null, 'student cannot call admin_set_role');
select throws_ok(
  $$select * from public.admin_list_users()$$,
  '42501', null, 'student cannot list users');
select throws_ok(
  $$select public.service_grant_role_by_email('s1@test.local', 'admin', null)$$,
  '42501', null, 'service-only grant function is not callable by users');
select results_eq(
  $$select count(*) from public.teacher_directory where user_id = '10000000-0000-4000-a000-000000000002'$$,
  array[0::bigint], 'teacher directory does not expose students');
select results_eq(
  $$select count(*) from public.teacher_directory where user_id = '10000000-0000-4000-a000-000000000011'$$,
  array[1::bigint], 'teacher directory exposes teacher display names');

-- ---------------------------------------------------------------- anonymous
reset role;
set local role anon;
select throws_ok($$select * from public.profiles$$, '42501', null, 'anonymous users cannot read profiles');

-- ---------------------------------------------------------------- admin
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-a000-000000000021","role":"authenticated"}', true);

select ok((select count(*) from public.admin_list_users()) >= 4, 'admin can list users');
select lives_ok(
  $$select public.admin_set_role('10000000-0000-4000-a000-000000000002', 'teacher', true)$$,
  'admin can grant teacher');
select throws_ok(
  $$select public.admin_set_role(auth.uid(), 'admin', false)$$,
  '22023', null, 'admin cannot remove their own admin role');

-- ---------------------------------------------------------------- verify as postgres
reset role;
select is(
  (select display_name from public.profiles where user_id = '10000000-0000-4000-a000-000000000002'),
  's2', 'student update of another profile affected nothing');
select results_eq(
  $$select role::text from public.user_roles where user_id = '10000000-0000-4000-a000-000000000002' order by role$$,
  array['student', 'teacher'], 'admin grant took effect');

select * from finish();
rollback;
