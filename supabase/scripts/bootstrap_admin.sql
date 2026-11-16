-- One-time trusted bootstrap of the FIRST administrator (also the recovery path
-- if every admin is lost). Run in the Supabase SQL editor (runs as postgres) or
-- with psql against the database. Never expose this as an app feature.
--
-- 1. The person signs up normally in the app and confirms their email.
-- 2. Replace the email below and run this script.
-- 3. They sign out and in again (UI refresh); database checks apply immediately.

do $$
declare
  v_email text := 'replace-me@example.com';
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(v_email);
  if v_user_id is null then
    raise exception 'No auth user with email %. Sign up first.', v_email;
  end if;

  insert into public.user_roles (user_id, role) values
    (v_user_id, 'teacher'),
    (v_user_id, 'admin')
  on conflict (user_id, role) do nothing;

  raise notice 'Granted teacher + admin to % (%)', v_email, v_user_id;
end;
$$;
