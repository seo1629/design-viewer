-- PDF 도면 회전 저장 (페이지별)
-- supabase.sql 을 먼저 돌린 뒤 이 파일을 돌립니다. 몇 번을 돌려도 안전합니다.
-- 확인: drawings 표에 page_rotations 칸({"1":0,"2":90,...}), 함수 set_drawing_page_rotations.
--
-- 값은 PDF 자체 회전(/Rotate) 위에 더하는 화면 회전입니다(0·90·180·270, 시계 방향).
-- 처음 열 때 글자 방향을 보고 자동으로 채우고, 사람이 회전하면 그 페이지만 덮어씁니다.

-- 1. 옛 칸(문서 전체 하나의 회전). 더는 읽지 않지만 지우지 않습니다.
alter table public.drawings add column if not exists rotation smallint not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'drawings_rotation_check') then
    alter table public.drawings add constraint drawings_rotation_check check (rotation in (0, 90, 180, 270));
  end if;
end $$;

-- 2. 페이지별 회전
alter table public.drawings add column if not exists page_rotations jsonb not null default '{}'::jsonb;

-- 3. 회전만 바꾸는 함수. drawings 표 자체의 update는 열지 않습니다(이름·경로는 못 바꾸게).
--    p_rotations 예: {"3": 90}. 들어온 페이지만 덮어쓰고 나머지는 그대로 둡니다.
create or replace function public.set_drawing_page_rotations(p_drawing_id uuid, p_rotations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  v jsonb;
  v_out jsonb;
begin
  if jsonb_typeof(p_rotations) <> 'object' then
    raise exception 'bad rotations' using errcode = '22023';
  end if;
  for k, v in select * from jsonb_each(p_rotations) loop
    if k !~ '^[1-9][0-9]{0,4}$' or jsonb_typeof(v) <> 'number' or (v::text)::int not in (0, 90, 180, 270) then
      raise exception 'bad rotation for page %', k using errcode = '22023';
    end if;
  end loop;
  update public.drawings set page_rotations = page_rotations || p_rotations
  where id = p_drawing_id
  returning page_rotations into v_out;
  if v_out is null then
    raise exception 'no such drawing' using errcode = 'P0002';
  end if;
  return v_out;
end $$;

revoke all on function public.set_drawing_page_rotations(uuid, jsonb) from public;
grant execute on function public.set_drawing_page_rotations(uuid, jsonb) to anon, authenticated;

-- 옛 함수 set_drawing_rotation(문서 전체 회전)은 예전 화면과의 호환을 위해 남겨 둡니다.
create or replace function public.set_drawing_rotation(p_drawing_id uuid, p_rotation int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_rotation not in (0, 90, 180, 270) then
    raise exception 'bad rotation' using errcode = '22023';
  end if;
  update public.drawings set rotation = p_rotation where id = p_drawing_id;
  if not found then
    raise exception 'no such drawing' using errcode = 'P0002';
  end if;
end $$;
revoke all on function public.set_drawing_rotation(uuid, int) from public;
grant execute on function public.set_drawing_rotation(uuid, int) to anon, authenticated;
