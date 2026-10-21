-- HTML 자료 (Kick-off 발표자료 등)
-- supabase.sql 을 먼저 돌린 뒤 이 파일을 돌립니다. 몇 번을 돌려도 안전합니다.
-- 확인: Table Editor에 documents, Storage에 documents 버킷(public).

-- 1. 표: 프로젝트마다 HTML 자료 여러 개
create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  name        text not null,
  path        text not null,
  owner       text,
  created_at  timestamptz not null default now()
);
create index if not exists documents_project_idx on public.documents (project_id, created_at desc);

-- 2. 누구나 읽고 올리기. 지우기는 삭제 코드 함수로만.
alter table public.documents enable row level security;
drop policy if exists "documents_read"   on public.documents;
drop policy if exists "documents_insert" on public.documents;
create policy "documents_read"   on public.documents for select using (true);
create policy "documents_insert" on public.documents for insert with check (true);

-- 3. 파일 저장소
insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do nothing;

drop policy if exists "documents_bucket_read"   on storage.objects;
drop policy if exists "documents_bucket_upload" on storage.objects;
create policy "documents_bucket_read"   on storage.objects for select using (bucket_id = 'documents');
create policy "documents_bucket_upload" on storage.objects for insert with check (bucket_id = 'documents');

-- 4. 실시간: 남이 올린 자료가 바로 뜨게
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'documents'
  ) then
    alter publication supabase_realtime add table public.documents;
  end if;
end $$;

-- 5. 자료 삭제 (프로젝트·코멘트와 같은 삭제 코드). Storage의 파일은 남습니다.
create or replace function public.delete_document(p_document_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.documents;
begin
  if not public.check_code('delete_code_sha256', p_code) then
    raise exception 'wrong code' using errcode = '28000';
  end if;
  delete from public.documents where id = p_document_id returning * into v_row;
  if v_row.id is null then
    raise exception 'no such document' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', v_row.id, 'path', v_row.path);
end $$;

revoke all on function public.delete_document(uuid, text) from public;
grant execute on function public.delete_document(uuid, text) to anon, authenticated;
