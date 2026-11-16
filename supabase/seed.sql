-- LOCAL DEVELOPMENT SEED ONLY. Never run against a hosted project.
--
-- Accounts (password for all: flashclass-dev-only):
--   admin@flashclass.test    student + teacher + admin
--   teacher@flashclass.test  student + teacher
--   student@flashclass.test  student (grade preference 7)

do $$
declare
  v_admin uuid := '00000000-0000-4000-a000-000000000001';
  v_teacher uuid := '00000000-0000-4000-a000-000000000002';
  v_student uuid := '00000000-0000-4000-a000-000000000003';
  v_users jsonb := jsonb_build_array(
    jsonb_build_object('id', v_admin, 'email', 'admin@flashclass.test', 'name', 'Админ'),
    jsonb_build_object('id', v_teacher, 'email', 'teacher@flashclass.test', 'name', 'Мария Иванова'),
    jsonb_build_object('id', v_student, 'email', 'student@flashclass.test', 'name', 'Георги')
  );
  v_user jsonb;
begin
  for v_user in select value from jsonb_array_elements(v_users) loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      (v_user ->> 'id')::uuid,
      'authenticated',
      'authenticated',
      v_user ->> 'email',
      extensions.crypt('flashclass-dev-only', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display_name', v_user ->> 'name', 'ui_locale', 'bg'),
      now(), now(), '', '', '', ''
    );

    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(),
      (v_user ->> 'id')::uuid,
      v_user ->> 'id',
      jsonb_build_object('sub', v_user ->> 'id', 'email', v_user ->> 'email', 'email_verified', true),
      'email',
      now(), now(), now()
    );
  end loop;

  insert into public.user_roles (user_id, role) values
    (v_admin, 'teacher'), (v_admin, 'admin'), (v_teacher, 'teacher');

  update public.profiles set grade_preference = '7' where user_id = v_student;
end;
$$;

-- Sample materials, created through the real write path as the teacher.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', false);

do $$
declare
  v_quiz uuid;
  v_cards uuid;
  v_guide uuid;
  v_english uuid;
begin
  v_quiz := public.save_material($json${
    "kind": "quiz",
    "title": "Дроби — основни действия",
    "description": "Събиране, изваждане и сравняване на обикновени дроби.",
    "language": "bg",
    "subject_code": "mathematics",
    "school_grade": 6,
    "questions": [
      {"type": "single_choice", "prompt": "Колко е 1/2 + 1/4?",
       "options": [{"id": "a", "text": "2/6"}, {"id": "b", "text": "3/4"}, {"id": "c", "text": "1/8"}],
       "answer": {"correct_option_ids": ["b"]},
       "explanation": "1/2 = 2/4, а 2/4 + 1/4 = 3/4."},
      {"type": "multiple_select", "prompt": "Кои дроби са равни на 1/2?",
       "options": [{"id": "a", "text": "2/4"}, {"id": "b", "text": "3/6"}, {"id": "c", "text": "2/3"}],
       "answer": {"correct_option_ids": ["a", "b"]}},
      {"type": "true_false", "prompt": "3/5 е по-голямо от 1/2.",
       "answer": {"correct_bool": true}},
      {"type": "short_answer", "prompt": "Запиши 0,25 като несъкратима дроб.",
       "answer": {"accepted_answers": ["1/4"]}}
    ]
  }$json$::jsonb);
  perform public.publish_material(v_quiz, true);

  v_cards := public.save_material($json${
    "kind": "flashcards",
    "title": "Столици на Европа",
    "description": "Основни европейски столици.",
    "language": "bg",
    "subject_code": "geography",
    "school_grade": 5,
    "content": {"version": 1, "cards": [
      {"front": "Франция", "back": "Париж"},
      {"front": "Германия", "back": "Берлин"},
      {"front": "Гърция", "back": "Атина"},
      {"front": "Румъния", "back": "Букурещ"}
    ]}
  }$json$::jsonb);
  perform public.publish_material(v_cards, true);

  v_guide := public.save_material($json${
    "kind": "study_guide",
    "title": "Фотосинтеза накратко",
    "language": "bg",
    "subject_code": "biology",
    "school_grade": 7,
    "content": {"version": 1, "sections": [
      {"heading": "Какво е фотосинтеза?", "body": "Процес, при който растенията използват светлина, вода и въглероден диоксид, за да произведат глюкоза и кислород."},
      {"heading": "Къде протича?", "body": "В хлоропластите на клетките, главно в листата."}
    ]}
  }$json$::jsonb);
  perform public.publish_material(v_guide, true);

  v_english := public.save_material($json${
    "kind": "practice_test",
    "title": "Present Simple vs Present Continuous",
    "language": "en",
    "subject_code": "english",
    "cefr_level": "A2",
    "questions": [
      {"type": "single_choice", "prompt": "She ___ to school every day.",
       "options": [{"id": "a", "text": "goes"}, {"id": "b", "text": "is going"}],
       "answer": {"correct_option_ids": ["a"]}},
      {"type": "short_answer", "prompt": "Complete: Look! It ___ (rain).",
       "answer": {"accepted_answers": ["is raining", "'s raining"]}}
    ]
  }$json$::jsonb);
  perform public.publish_material(v_english, true);

  -- A private draft that students must never see.
  perform public.save_material($json${
    "kind": "quiz",
    "title": "Чернова — не е публикувана",
    "subject_code": "history",
    "questions": []
  }$json$::jsonb);
end;
$$;

select set_config('request.jwt.claims', '', false);
