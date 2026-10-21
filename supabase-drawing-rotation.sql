-- PDF 도면 회전 저장
-- supabase.sql 을 먼저 돌린 뒤 이 파일을 돌립니다. 몇 번을 돌려도 안전합니다.
-- 확인: drawings 표에 rotation 칸(0·90·180·270), 함수 set_drawing_rotation.

-- 1. 도면마다 회전값 (도, 시계 방향 기준은 화면과 같음)
alter table public.drawings add column if not exists rotation smallint not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'drawings_rotation_check') then
    alter table public.drawings add constraint drawings_rotation_check check (rotation in (0, 90, 180, 270));
  end if;
end $$;

-- 2. 회전만 바꾸는 함수. drawings 표 자체의 update는 열지 않습니다(이름·경로는 못 바꾸게).
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
