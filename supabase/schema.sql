-- Participa v0.2.0 · © 2026 Mg. Lic. Prof. Leandro Guerschberg
-- Ejecutar completo en el SQL Editor de Supabase.
-- Requiere: Supabase Auth -> Anonymous sign-ins habilitado.
-- Se puede volver a ejecutar sin perder datos (usa "if not exists" y "create or replace").
create extension if not exists pgcrypto;

-- =====================================================================
-- Tablas
-- =====================================================================
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 3 and 120),
  mode text not null check (mode in ('poll','quiz')),
  created_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  position integer not null check (position >= 0),
  body text not null check (length(body) between 3 and 500),
  unique (activity_id, position)
);

create table if not exists public.options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  position integer not null,
  label text not null check (length(label) between 1 and 150),
  is_correct boolean not null default false,
  unique (question_id, position)
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id),
  pin text not null check (pin ~ '^\d{6}$'),
  status text not null default 'open' check (status in ('open','closed')),
  phase text not null default 'waiting' check (phase in ('waiting','question','results','finished')),
  question_index integer not null default -1,
  created_at timestamptz not null default now()
);

create table if not exists public.participants (
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table if not exists public.responses (
  session_id uuid not null,
  question_id uuid not null references public.questions(id),
  user_id uuid not null references auth.users(id),
  option_id uuid not null references public.options(id),
  created_at timestamptz not null default now(),
  primary key (session_id, question_id, user_id),
  foreign key (session_id, user_id) references public.participants(session_id, user_id) on delete cascade
);
create index if not exists idx_responses_question on public.responses(session_id, question_id, option_id);

-- ---------------------------------------------------------------------
-- Cambios de la versión 0.2 (se aplican también sobre una base existente)
-- ---------------------------------------------------------------------
alter table public.participants add column if not exists nickname text
  check (nickname is null or length(nickname) between 1 and 24);
alter table public.sessions add column if not exists question_started_at timestamptz;
alter table public.responses add column if not exists points integer not null default 0;

-- Un PIN solo tiene que ser único entre las salas abiertas: así los códigos se reutilizan.
alter table public.sessions drop constraint if exists sessions_pin_key;
create unique index if not exists sessions_open_pin on public.sessions(pin) where status = 'open';
create index if not exists sessions_pin_recent on public.sessions(pin, created_at desc);
create index if not exists sessions_open_created on public.sessions(created_at) where status = 'open';

-- Ninguna tabla es accesible directamente desde el cliente.
-- Solo funciones RPC con validaciones de identidad y pertenencia a una sala.
revoke all on public.admin_users, public.activities, public.questions, public.options,
  public.sessions, public.participants, public.responses from anon, authenticated;
alter table public.admin_users  enable row level security;
alter table public.activities   enable row level security;
alter table public.questions    enable row level security;
alter table public.options      enable row level security;
alter table public.sessions     enable row level security;
alter table public.participants enable row level security;
alter table public.responses    enable row level security;

-- =====================================================================
-- Utilidades internas (no se exponen al cliente)
-- =====================================================================
create or replace function public.is_participa_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()))
$$;
revoke all on function public.is_participa_admin() from public, anon;
grant execute on function public.is_participa_admin() to authenticated;

-- Las salas abiertas hace más de 24 horas se cierran solas.
create or replace function public._expire_sessions() returns void
language sql security definer set search_path = '' as $$
  update public.sessions set status = 'closed', phase = 'finished'
  where status = 'open' and created_at < now() - interval '24 hours'
$$;
revoke all on function public._expire_sessions() from public, anon, authenticated;

create or replace function public._assert_editable(p_activity uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_participa_admin() then raise exception 'Sin permisos'; end if;
  if not exists (select 1 from public.activities where id = p_activity) then raise exception 'Actividad inexistente'; end if;
  if exists (select 1 from public.sessions where activity_id = p_activity and status = 'open') then
    raise exception 'Cerrá la sala abierta de esta actividad antes de editarla';
  end if;
end $$;
revoke all on function public._assert_editable(uuid) from public, anon, authenticated;

create or replace function public._check_options(p_mode text, p_text text, p_options text[], p_correct integer) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if length(trim(coalesce(p_text, ''))) < 3 then raise exception 'La pregunta debe tener al menos 3 caracteres'; end if;
  if coalesce(array_length(p_options, 1), 0) not between 2 and 4 then raise exception 'Se requieren entre 2 y 4 opciones'; end if;
  if exists (select 1 from unnest(p_options) x where length(trim(x)) not between 1 and 150) then raise exception 'Opciones inválidas'; end if;
  if p_mode = 'quiz' and (p_correct is null or p_correct < 0 or p_correct >= array_length(p_options, 1)) then
    raise exception 'Elegí la respuesta correcta';
  end if;
end $$;
revoke all on function public._check_options(text,text,text[],integer) from public, anon, authenticated;

-- Sesión más reciente con ese PIN (los PIN de salas cerradas se reutilizan).
create or replace function public._session_by_pin(p_pin text) returns public.sessions
language sql stable security definer set search_path = '' as $$
  select * from public.sessions where pin = p_pin order by (status = 'open') desc, created_at desc limit 1
$$;
revoke all on function public._session_by_pin(text) from public, anon, authenticated;

-- =====================================================================
-- Funciones de administración: actividades y preguntas
-- =====================================================================
drop function if exists public.admin_list_activities();
create or replace function public.admin_list_activities() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_participa_admin() then raise exception 'Sin permisos de administración'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'title', a.title, 'mode', a.mode, 'created_at', a.created_at,
      'question_count', (select count(*) from public.questions q where q.activity_id = a.id),
      'session_count', (select count(*) from public.sessions s where s.activity_id = a.id),
      'open_session', (select s.id from public.sessions s where s.activity_id = a.id and s.status = 'open' order by s.created_at desc limit 1)
    ) order by a.created_at desc)
    from public.activities a
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_create_activity(p_title text, p_mode text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_participa_admin() then raise exception 'Sin permisos'; end if;
  if length(trim(coalesce(p_title, ''))) < 3 then raise exception 'El título debe tener al menos 3 caracteres'; end if;
  insert into public.activities(title, mode) values (trim(p_title), p_mode) returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_get_activity(p_activity uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.is_participa_admin() then raise exception 'Sin permisos'; end if;
  select jsonb_build_object(
    'id', a.id, 'title', a.title, 'mode', a.mode,
    'has_open_session', exists (select 1 from public.sessions s where s.activity_id = a.id and s.status = 'open'),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'position', q.position, 'body', q.body,
        'has_responses', exists (select 1 from public.responses r where r.question_id = q.id),
        'options', (select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'is_correct', o.is_correct) order by o.position)
                    from public.options o where o.question_id = q.id)
      ) order by q.position)
      from public.questions q where q.activity_id = a.id), '[]'::jsonb))
  into v from public.activities a where a.id = p_activity;
  if v is null then raise exception 'Actividad inexistente'; end if;
  return v;
end $$;

create or replace function public.admin_rename_activity(p_activity uuid, p_title text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_participa_admin() then raise exception 'Sin permisos'; end if;
  if length(trim(coalesce(p_title, ''))) < 3 then raise exception 'El título debe tener al menos 3 caracteres'; end if;
  update public.activities set title = trim(p_title) where id = p_activity;
  if not found then raise exception 'Actividad inexistente'; end if;
end $$;

-- Borra la actividad con sus preguntas y el historial de sus salas.
create or replace function public.admin_delete_activity(p_activity uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._assert_editable(p_activity);
  delete from public.sessions where activity_id = p_activity;   -- arrastra participantes y respuestas
  delete from public.activities where id = p_activity;          -- arrastra preguntas y opciones
end $$;

create or replace function public.admin_add_question(p_activity uuid, p_text text, p_options text[], p_correct integer default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_mode text; v_id uuid; v_pos integer; v_i integer;
begin
  perform public._assert_editable(p_activity);
  -- Bloquear la actividad para asignar posiciones sin carreras entre inserciones.
  select mode into v_mode from public.activities where id = p_activity for update;
  perform public._check_options(v_mode, p_text, p_options, p_correct);
  select count(*) into v_pos from public.questions where activity_id = p_activity;
  insert into public.questions(activity_id, position, body) values (p_activity, v_pos, trim(p_text)) returning id into v_id;
  for v_i in 1..array_length(p_options, 1) loop
    insert into public.options(question_id, position, label, is_correct)
    values (v_id, v_i - 1, trim(p_options[v_i]), v_mode = 'quiz' and p_correct = v_i - 1);
  end loop;
  return v_id;
end $$;

-- El enunciado se puede corregir siempre; las opciones, solo si nadie respondió todavía.
create or replace function public.admin_update_question(p_question uuid, p_text text, p_options text[], p_correct integer default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_act uuid; v_mode text; v_same boolean; v_i integer;
begin
  select q.activity_id, a.mode into v_act, v_mode from public.questions q join public.activities a on a.id = q.activity_id where q.id = p_question;
  if v_act is null then raise exception 'Pregunta inexistente'; end if;
  perform public._assert_editable(v_act);
  perform public._check_options(v_mode, p_text, p_options, p_correct);
  update public.questions set body = trim(p_text) where id = p_question;
  select coalesce(array_agg(label order by position), '{}') = (select array_agg(trim(x)) from unnest(p_options) x)
     and (v_mode <> 'quiz' or coalesce((select position from public.options where question_id = p_question and is_correct), -1) = p_correct)
    into v_same from public.options where question_id = p_question;
  if v_same then return; end if;
  if exists (select 1 from public.responses where question_id = p_question) then
    raise exception 'Esta pregunta ya tiene respuestas: podés corregir el enunciado, pero no las opciones';
  end if;
  delete from public.options where question_id = p_question;
  for v_i in 1..array_length(p_options, 1) loop
    insert into public.options(question_id, position, label, is_correct)
    values (p_question, v_i - 1, trim(p_options[v_i]), v_mode = 'quiz' and p_correct = v_i - 1);
  end loop;
end $$;

create or replace function public.admin_delete_question(p_question uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_act uuid; v_pos integer;
begin
  select activity_id, position into v_act, v_pos from public.questions where id = p_question;
  if v_act is null then raise exception 'Pregunta inexistente'; end if;
  perform public._assert_editable(v_act);
  perform 1 from public.activities where id = v_act for update;
  delete from public.responses where question_id = p_question;
  delete from public.questions where id = p_question;
  -- Renumerar en dos pasos para no chocar con la restricción de posición única.
  update public.questions set position = position + 100000 where activity_id = v_act and position > v_pos;
  update public.questions set position = position - 100001 where activity_id = v_act and position >= 100000;
end $$;

create or replace function public.admin_move_question(p_question uuid, p_delta integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_act uuid; v_pos integer; v_other uuid;
begin
  if p_delta not in (-1, 1) then raise exception 'Movimiento inválido'; end if;
  select activity_id, position into v_act, v_pos from public.questions where id = p_question;
  if v_act is null then raise exception 'Pregunta inexistente'; end if;
  perform public._assert_editable(v_act);
  perform 1 from public.activities where id = v_act for update;
  select id into v_other from public.questions where activity_id = v_act and position = v_pos + p_delta;
  if v_other is null then return; end if;
  update public.questions set position = 100000 where id = p_question;
  update public.questions set position = v_pos where id = v_other;
  update public.questions set position = v_pos + p_delta where id = p_question;
end $$;

-- =====================================================================
-- Funciones de administración: salas
-- =====================================================================
create or replace function public.admin_launch(p_activity uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_pin text; v_id uuid; v_i integer; v_bytes bytea; v_free boolean := false;
begin
  if not public.is_participa_admin() then raise exception 'Sin permisos'; end if;
  if not exists (select 1 from public.questions where activity_id = p_activity) then
    raise exception 'La actividad necesita preguntas';
  end if;
  perform public._expire_sessions();
  -- Si ya hay una sala abierta para esta actividad, se retoma en lugar de abrir otra.
  select id into v_id from public.sessions where activity_id = p_activity and status = 'open' order by created_at desc limit 1;
  if v_id is not null then return public.admin_session_info(v_id); end if;
  for v_i in 1..30 loop
    v_bytes := extensions.gen_random_bytes(4);
    v_pin := lpad(((get_byte(v_bytes,0)::bigint * 16777216 + get_byte(v_bytes,1)::bigint * 65536
                  + get_byte(v_bytes,2)::bigint * 256 + get_byte(v_bytes,3)::bigint) % 1000000)::text, 6, '0');
    if not exists (select 1 from public.sessions where pin = v_pin and status = 'open') then v_free := true; exit; end if;
  end loop;
  if not v_free then raise exception 'No se pudo generar un código libre; intentá de nuevo'; end if;
  insert into public.sessions(activity_id, pin) values (p_activity, v_pin) returning id into v_id;
  return public.admin_session_info(v_id);
end $$;

create or replace function public.admin_session_info(p_session uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.is_participa_admin() then raise exception 'Sin permisos'; end if;
  select jsonb_build_object(
    'id', s.id, 'pin', s.pin, 'status', s.status, 'phase', s.phase,
    'question_index', s.question_index,
    'question_total', (select count(*) from public.questions q where q.activity_id = s.activity_id),
    'activity_id', s.activity_id, 'title', a.title, 'mode', a.mode, 'created_at', s.created_at)
  into v
  from public.sessions s join public.activities a on a.id = s.activity_id
  where s.id = p_session;
  if v is null then raise exception 'Sesión inexistente'; end if;
  return v;
end $$;

create or replace function public.admin_control(p_session uuid, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_s public.sessions%rowtype; v_count integer;
begin
  if not public.is_participa_admin() then raise exception 'Sin permisos'; end if;
  select * into v_s from public.sessions where id = p_session for update;
  if not found then raise exception 'Sesión inexistente'; end if;
  if p_action = 'close' then
    update public.sessions set status = 'closed', phase = 'finished' where id = p_session;
  elsif v_s.status = 'closed' then
    raise exception 'Sesión cerrada';
  elsif p_action = 'reveal' then
    if v_s.phase <> 'question' then raise exception 'No hay pregunta abierta'; end if;
    update public.sessions set phase = 'results' where id = p_session;
  elsif p_action = 'next' then
    select count(*) into v_count from public.questions where activity_id = v_s.activity_id;
    if v_s.question_index + 1 >= v_count then
      update public.sessions set status = 'closed', phase = 'finished' where id = p_session;
    else
      update public.sessions set question_index = question_index + 1, phase = 'question', question_started_at = now()
      where id = p_session;
    end if;
  else
    raise exception 'Acción desconocida';
  end if;
  perform realtime.send(jsonb_build_object('action','refresh'), 'refresh', 'room:' || p_session::text, false);
end $$;

-- Resultados de una sala para descargar como CSV.
create or replace function public.admin_export(p_session uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_act uuid;
begin
  if not public.is_participa_admin() then raise exception 'Sin permisos'; end if;
  select activity_id into v_act from public.sessions where id = p_session;
  if v_act is null then raise exception 'Sesión inexistente'; end if;
  return jsonb_build_object(
    'participants', (select count(*) from public.participants where session_id = p_session),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question_number', q.position + 1, 'question', q.body, 'option', o.label, 'is_correct', o.is_correct,
        'votes', (select count(*) from public.responses r where r.session_id = p_session and r.option_id = o.id)
      ) order by q.position, o.position)
      from public.questions q join public.options o on o.question_id = q.id
      where q.activity_id = v_act), '[]'::jsonb),
    'ranking', coalesce((
      select jsonb_agg(jsonb_build_object('name', coalesce(t.nickname, 'Sin apodo'), 'score', t.score) order by t.score desc)
      from (select p.nickname, coalesce(sum(r.points), 0) as score
            from public.participants p left join public.responses r on r.session_id = p.session_id and r.user_id = p.user_id
            where p.session_id = p_session group by p.user_id, p.nickname) t), '[]'::jsonb));
end $$;

-- =====================================================================
-- Funciones públicas (participantes y proyector)
-- =====================================================================
create or replace function public.room_state(p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.sessions%rowtype; v_q public.questions%rowtype; v_uid uuid := (select auth.uid());
  v_title text; v_mode text; v_total integer := 0; v_my uuid; v_options jsonb := '[]'::jsonb;
  v_joined integer; v_qtotal integer; v_admin boolean; v_results boolean; v_nick text;
  v_board jsonb; v_score integer; v_rank integer; v_last integer; v_show_board boolean;
begin
  if v_uid is null then raise exception 'Ingresá a la sesión primero'; end if;
  perform public._expire_sessions();
  v_s := public._session_by_pin(p_pin);
  if v_s.id is null then raise exception 'No hay ninguna sala con ese código'; end if;
  select title, mode into v_title, v_mode from public.activities where id = v_s.activity_id;
  v_admin := public.is_participa_admin();
  -- El ingreso registra solamente el identificador anónimo interno, no nombre, email ni IP.
  -- El administrador (p. ej. desde el proyector) no se cuenta como participante.
  if v_s.status = 'open' and not v_admin then
    insert into public.participants(session_id, user_id) values (v_s.id, v_uid) on conflict do nothing;
  end if;
  if not v_admin and not exists (select 1 from public.participants where session_id = v_s.id and user_id = v_uid) then
    raise exception 'Esta sala ya terminó';
  end if;
  select nickname into v_nick from public.participants where session_id = v_s.id and user_id = v_uid;
  if v_s.question_index >= 0 then
    select * into v_q from public.questions where activity_id = v_s.activity_id and position = v_s.question_index;
  end if;
  select count(*) into v_joined from public.participants where session_id = v_s.id;
  select count(*) into v_qtotal from public.questions where activity_id = v_s.activity_id;
  v_results := v_s.phase in ('results', 'finished');
  if v_q.id is not null then
    select count(*) into v_total from public.responses where session_id = v_s.id and question_id = v_q.id;
    select option_id, points into v_my, v_last from public.responses where session_id = v_s.id and question_id = v_q.id and user_id = v_uid;
    -- Los votos y la respuesta correcta solo se envían cuando se revelan los resultados.
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'label', o.label,
      'votes', case when v_results then (select count(*) from public.responses r where r.session_id = v_s.id and r.question_id = v_q.id and r.option_id = o.id) end,
      'is_correct', case when v_results and v_mode = 'quiz' then o.is_correct end
    ) order by o.position), '[]'::jsonb)
    into v_options from public.options o where o.question_id = v_q.id;
  end if;
  -- Ranking de competencias: visible al revelar resultados y al terminar.
  v_show_board := v_mode = 'quiz' and (v_s.phase in ('results', 'finished') or v_s.status = 'closed');
  if v_show_board then
    with scores as (
      select p.user_id, p.nickname, coalesce(sum(r.points), 0)::integer as score,
             rank() over (order by coalesce(sum(r.points), 0) desc) as pos
      from public.participants p left join public.responses r on r.session_id = p.session_id and r.user_id = p.user_id
      where p.session_id = v_s.id group by p.user_id, p.nickname)
    select coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(nickname, 'Sin apodo'), 'score', score, 'pos', pos, 'me', user_id = v_uid) order by pos, nickname)
                     from (select * from scores order by pos, nickname limit 5) t), '[]'::jsonb),
           (select score from scores where user_id = v_uid),
           (select pos from scores where user_id = v_uid)
      into v_board, v_score, v_rank;
  end if;
  return jsonb_build_object(
    'session_id', v_s.id, 'pin', v_s.pin, 'title', v_title, 'mode', v_mode,
    'status', v_s.status, 'phase', v_s.phase,
    'question_id', v_q.id, 'question_text', v_q.body,
    'question_number', case when v_q.id is not null then v_s.question_index + 1 end,
    'question_total', v_qtotal, 'question_started_at', v_s.question_started_at,
    'options', v_options, 'total_votes', v_total, 'my_answer', v_my,
    'participants', v_joined, 'show_results', v_s.phase = 'results',
    'is_admin', v_admin, 'nickname', v_nick,
    'my_points', case when v_results then v_last end,
    'my_score', v_score, 'my_rank', v_rank, 'leaderboard', v_board);
end $$;

create or replace function public.set_nickname(p_pin text, p_nickname text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_s public.sessions%rowtype; v_name text := trim(regexp_replace(coalesce(p_nickname, ''), '\s+', ' ', 'g'));
begin
  if (select auth.uid()) is null then raise exception 'No hay sesión de participante'; end if;
  if length(v_name) not between 1 and 24 then raise exception 'El apodo debe tener entre 1 y 24 caracteres'; end if;
  v_s := public._session_by_pin(p_pin);
  if v_s.id is null or v_s.status <> 'open' then raise exception 'Esta sala ya terminó'; end if;
  update public.participants set nickname = v_name where session_id = v_s.id and user_id = (select auth.uid());
  if not found then raise exception 'Primero ingresá a la sala'; end if;
end $$;

create or replace function public.submit_answer(p_pin text, p_option uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_s public.sessions%rowtype; v_q uuid; v_mode text; v_correct boolean; v_points integer := 0; v_secs numeric;
begin
  if (select auth.uid()) is null then raise exception 'No hay sesión de participante'; end if;
  v_s := public._session_by_pin(p_pin);
  if v_s.id is null or v_s.status <> 'open' or v_s.phase <> 'question' then raise exception 'La pregunta no está abierta'; end if;
  if not exists (select 1 from public.participants where session_id = v_s.id and user_id = (select auth.uid())) then
    raise exception 'Primero ingresá a la sala';
  end if;
  select q.id, a.mode into v_q, v_mode from public.questions q join public.activities a on a.id = q.activity_id
  where q.activity_id = v_s.activity_id and q.position = v_s.question_index;
  select is_correct into v_correct from public.options where id = p_option and question_id = v_q;
  if not found then raise exception 'Opción inválida'; end if;
  -- Competencia: 500 puntos por acertar + hasta 500 por rapidez (decrece en 20 segundos).
  if v_mode = 'quiz' and v_correct then
    v_secs := extract(epoch from now() - coalesce(v_s.question_started_at, now()));
    v_points := 500 + round(500 * greatest(0, 1 - v_secs / 20.0));
  end if;
  insert into public.responses(session_id, question_id, user_id, option_id, points)
  values (v_s.id, v_q, (select auth.uid()), p_option, v_points);
  perform realtime.send(jsonb_build_object('action','refresh'), 'refresh', 'room:' || v_s.id::text, false);
exception when unique_violation then
  raise exception 'Ya respondiste esta pregunta';
end $$;

-- =====================================================================
-- Permisos de ejecución: solo usuarios autenticados (incluye cuentas anónimas de Auth).
-- Las funciones de administración verifican además public.admin_users.
-- =====================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_list_activities()', 'public.admin_create_activity(text,text)',
    'public.admin_get_activity(uuid)', 'public.admin_rename_activity(uuid,text)', 'public.admin_delete_activity(uuid)',
    'public.admin_add_question(uuid,text,text[],integer)', 'public.admin_update_question(uuid,text,text[],integer)',
    'public.admin_delete_question(uuid)', 'public.admin_move_question(uuid,integer)',
    'public.admin_launch(uuid)', 'public.admin_session_info(uuid)', 'public.admin_control(uuid,text)',
    'public.admin_export(uuid)', 'public.room_state(text)', 'public.set_nickname(text,text)',
    'public.submit_answer(text,uuid)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- IMPORTANTE: crear el usuario email/contraseña en Supabase Authentication > Users.
-- Luego ejecutar UNA SOLA VEZ, sustituyendo el UUID por el ID real del administrador:
-- insert into public.admin_users(user_id) values ('UUID-DEL-ADMINISTRADOR');
