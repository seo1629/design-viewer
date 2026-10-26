-- 프로젝트별 폴더 (배치도 · 단위세대 · 상세도 …)
-- supabase.sql, supabase-documents.sql 다음에 돌립니다. 몇 번을 돌려도 안전합니다.
-- 확인: Table Editor에 folders, models·drawings·documents에 folder_id 칸.

-- 1. 폴더 표: 프로젝트마다 이름이 겹치지 않게
create table if not exists public.folders (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  unique (project_id, name)
);
create index if not exists folders_project_idx on public.folders (project_id, sort);

alter table public.folders enable row level security;
drop policy if exists "folders_read"   on public.folders;
drop policy if exists "folders_insert" on public.folders;
create policy "folders_read"   on public.folders for select using (true);
create policy "folders_insert" on public.folders for insert with check (true);

-- 2. 파일이 들어 있는 폴더. 폴더를 지우면 파일은 남고 '미분류'가 됩니다.
alter table public.models    add column if not exists folder_id uuid references public.folders(id) on delete set null;
alter table public.drawings  add column if not exists folder_id uuid references public.folders(id) on delete set null;
alter table public.documents add column if not exists folder_id uuid references public.folders(id) on delete set null;

-- 3. 파일 폴더 옮기기. 표 자체의 update는 열지 않고 folder_id만 바꿉니다.
create or replace function public.set_file_folder(p_table text, p_id uuid, p_folder_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_folder_id is not null and not exists (select 1 from public.folders where id = p_folder_id) then
    raise exception 'no such folder' using errcode = 'P0002';
  end if;
  if p_table = 'models' then
    update public.models set folder_id = p_folder_id where id = p_id;
  elsif p_table = 'drawings' then
    update public.drawings set folder_id = p_folder_id where id = p_id;
  elsif p_table = 'documents' then
    update public.documents set folder_id = p_folder_id where id = p_id;
  else
    raise exception 'bad table' using errcode = '22023';
  end if;
  if not found then
    raise exception 'no such file' using errcode = 'P0002';
  end if;
end $$;

-- 4. 폴더 지우기 (프로젝트·코멘트와 같은 삭제 코드). 안의 파일은 미분류로.
create or replace function public.delete_folder(p_folder_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.folders;
begin
  if not public.check_code('delete_code_sha256', p_code) then
    raise exception 'wrong code' using errcode = '28000';
  end if;
  delete from public.folders where id = p_folder_id returning * into v_row;
  if v_row.id is null then
    raise exception 'no such folder' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', v_row.id, 'name', v_row.name);
end $$;

revoke all on function public.set_file_folder(text, uuid, uuid) from public;
revoke all on function public.delete_folder(uuid, text) from public;
grant execute on function public.set_file_folder(text, uuid, uuid) to anon, authenticated;
grant execute on function public.delete_folder(uuid, text) to anon, authenticated;

-- 5. 실시간: 폴더 추가·삭제, 파일 이동이 남의 화면에도 바로
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'folders') then
    alter publication supabase_realtime add table public.folders;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'models') then
    alter publication supabase_realtime add table public.models;
  end if;
end $$;
