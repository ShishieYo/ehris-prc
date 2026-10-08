-- 0005_documents.sql
-- Personnel folder. Files live in the private Storage bucket
-- `personnel-documents`; the database holds metadata and an immutable version
-- chain. Nothing is ever overwritten: replacing a file adds a version.
set search_path = public, extensions;

create table public.document_categories (
  code            text primary key,
  name            text not null,
  group_name      text not null,
  is_required     boolean not null default false,
  requires_expiry boolean not null default false,
  sort_order      int not null default 0,
  is_active       boolean not null default true
);

create table public.documents (
  id                  uuid primary key default gen_random_uuid(),
  doc_no              text not null unique default public.next_number('DOC'),
  employee_id         uuid not null references public.employees(id) on delete cascade,
  category_code       text not null references public.document_categories(code),
  title               text not null check (length(btrim(title)) > 0),
  doc_date            date,
  issuing_agency      text,
  expires_on          date,
  status              text not null default 'for_review'
                        check (status in ('for_review', 'verified', 'rejected', 'archived')),
  remarks             text,
  current_version_no  int not null default 0,
  -- Optional link to the request this file supports (e.g. an attendance correction).
  related_entity_type text check (related_entity_type in ('leave_application', 'attendance_correction', 'hr_request')),
  related_entity_id   uuid,
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  deleted_by          uuid,
  deleted_reason      text,
  check ((related_entity_type is null) = (related_entity_id is null))
);
create index documents_employee_idx on public.documents(employee_id, category_code);
create index documents_related_idx on public.documents(related_entity_type, related_entity_id);
create trigger documents_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

create table public.document_versions (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid not null references public.documents(id) on delete cascade,
  version_no       int not null,
  storage_path     text not null unique,
  file_name        text not null,
  mime_type        text not null,
  size_bytes       bigint not null check (size_bytes > 0),
  sha256           text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by      uuid not null default auth.uid(),
  uploaded_by_name text not null,
  uploaded_at      timestamptz not null default now(),
  change_reason    text,
  unique (document_id, version_no)
);
create index document_versions_hash_idx on public.document_versions(sha256);

alter table public.service_records
  add constraint service_records_document_fk foreign key (document_id)
  references public.documents(id) on delete set null;

-- Versions are immutable evidence.
create function public.document_versions_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;  -- allow cascade from a deleted employee/document
  end if;
  raise exception 'Document versions are immutable' using errcode = '42501', hint = 'user';
end $$;
create trigger document_versions_no_change before update or delete on public.document_versions
  for each row execute function public.document_versions_immutable();

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
create function public.can_read_document(p_document uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare d public.documents;
begin
  select * into d from public.documents where id = p_document;
  if not found then
    return false;
  end if;
  if public.has_permission('document.read_all') then
    return true;
  end if;
  if d.deleted_at is not null then
    return false;
  end if;
  if public.is_self(d.employee_id) then
    return true;
  end if;
  -- Supporting files of a request the caller is entitled to review.
  if d.related_entity_type is not null and public.can_read_request(d.related_entity_type, d.related_entity_id) then
    return true;
  end if;
  return false;
end $$;

create function public.can_upload_document_for(p_employee uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_self(p_employee) or public.has_permission('document.write')
$$;

-- ---------------------------------------------------------------------------
-- Write path
-- ---------------------------------------------------------------------------
create function public.check_upload(p_mime text, p_size bigint) returns void
language plpgsql stable security definer set search_path = public as $$
declare
  v_max_mb numeric := coalesce((select (value #>> '{}')::numeric from public.system_settings where key = 'documents.max_size_mb'), 10);
  v_allowed jsonb := coalesce((select value from public.system_settings where key = 'documents.allowed_mime'),
                              '["application/pdf","image/jpeg","image/png"]'::jsonb);
begin
  if p_size > v_max_mb * 1024 * 1024 then
    raise exception 'File is larger than the allowed size' using errcode = '22023', hint = 'user';
  end if;
  if not (v_allowed ? p_mime) then
    raise exception 'This file type is not allowed' using errcode = '22023', hint = 'user';
  end if;
end $$;

create function public.assert_storage_object(p_employee uuid, p_path text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if split_part(p_path, '/', 1) <> p_employee::text then
    raise exception 'Invalid storage location' using errcode = '22023', hint = 'user';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'personnel-documents' and name = p_path) then
    raise exception 'Uploaded file was not found' using errcode = '22023', hint = 'user';
  end if;
end $$;

create function public.create_document(
  p_employee_id    uuid,
  p_category_code  text,
  p_title          text,
  p_doc_date       date,
  p_issuing_agency text,
  p_expires_on     date,
  p_remarks        text,
  p_related_type   text,
  p_related_id     uuid,
  p_storage_path   text,
  p_file_name      text,
  p_mime_type      text,
  p_size_bytes     bigint,
  p_sha256         text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_hr boolean := public.has_permission('document.write');
begin
  if not public.can_upload_document_for(p_employee_id) then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  if not exists (select 1 from public.document_categories where code = p_category_code and is_active) then
    raise exception 'Unknown document category' using errcode = '22023', hint = 'user';
  end if;
  if p_related_type is not null and not public.can_read_request(p_related_type, p_related_id) then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  perform public.check_upload(p_mime_type, p_size_bytes);
  perform public.assert_storage_object(p_employee_id, p_storage_path);

  insert into public.documents (
    employee_id, category_code, title, doc_date, issuing_agency, expires_on, remarks,
    related_entity_type, related_entity_id, status, current_version_no
  ) values (
    p_employee_id, p_category_code, p_title, p_doc_date, p_issuing_agency, p_expires_on, p_remarks,
    p_related_type, p_related_id, case when v_hr then 'verified' else 'for_review' end, 1
  ) returning id into v_id;

  insert into public.document_versions (
    document_id, version_no, storage_path, file_name, mime_type, size_bytes, sha256, uploaded_by_name, change_reason
  ) values (
    v_id, 1, p_storage_path, p_file_name, p_mime_type, p_size_bytes, p_sha256,
    public.audit_actor_label(), 'Initial upload'
  );
  return v_id;
end $$;

create function public.add_document_version(
  p_document_id  uuid,
  p_storage_path text,
  p_file_name    text,
  p_mime_type    text,
  p_size_bytes   bigint,
  p_sha256       text,
  p_reason       text
) returns int
language plpgsql security definer set search_path = public as $$
declare
  d public.documents;
  v_next int;
  v_hr boolean := public.has_permission('document.write');
begin
  select * into d from public.documents where id = p_document_id and deleted_at is null for update;
  if not found or not (v_hr or public.is_self(d.employee_id)) then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required when replacing a document' using errcode = '22023', hint = 'user';
  end if;
  if exists (select 1 from public.document_versions where document_id = d.id and sha256 = p_sha256) then
    raise exception 'This exact file is already stored for this document' using errcode = '23505', hint = 'user';
  end if;
  perform public.check_upload(p_mime_type, p_size_bytes);
  perform public.assert_storage_object(d.employee_id, p_storage_path);

  v_next := d.current_version_no + 1;
  insert into public.document_versions (
    document_id, version_no, storage_path, file_name, mime_type, size_bytes, sha256, uploaded_by_name, change_reason
  ) values (
    d.id, v_next, p_storage_path, p_file_name, p_mime_type, p_size_bytes, p_sha256,
    public.audit_actor_label(), p_reason
  );
  perform set_config('app.change_reason', p_reason, true);
  update public.documents
  set current_version_no = v_next,
      status = case when v_hr then 'verified' else 'for_review' end
  where id = d.id;
  return v_next;
end $$;

create function public.update_document_details(
  p_document_id    uuid,
  p_title          text,
  p_doc_date       date,
  p_issuing_agency text,
  p_expires_on     date,
  p_remarks        text
) returns void
language plpgsql security definer set search_path = public as $$
declare d public.documents;
begin
  select * into d from public.documents where id = p_document_id and deleted_at is null;
  if not found or not (public.has_permission('document.write')
                       or (public.is_self(d.employee_id) and d.status <> 'verified')) then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  update public.documents
  set title = p_title, doc_date = p_doc_date, issuing_agency = p_issuing_agency,
      expires_on = p_expires_on, remarks = p_remarks
  where id = p_document_id;
end $$;

create function public.set_document_status(p_document_id uuid, p_status text, p_remarks text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('document.verify') then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  if p_status not in ('for_review', 'verified', 'rejected', 'archived') then
    raise exception 'Invalid status' using errcode = '22023', hint = 'user';
  end if;
  if p_status = 'rejected' and coalesce(btrim(p_remarks), '') = '' then
    raise exception 'Remarks are required when rejecting a document' using errcode = '22023', hint = 'user';
  end if;
  perform set_config('app.change_reason', coalesce(p_remarks, ''), true);
  update public.documents set status = p_status, remarks = coalesce(p_remarks, remarks)
  where id = p_document_id and deleted_at is null;
  if not found then
    raise exception 'Document not found' using errcode = 'P0002', hint = 'user';
  end if;
end $$;

-- Soft delete: the metadata and every stored version are retained; the
-- document disappears for everyone except records managers. Physical purge is
-- an agency records-retention decision and is intentionally not automated.
create function public.delete_document(p_document_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('document.delete') then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required to delete a document' using errcode = '22023', hint = 'user';
  end if;
  perform set_config('app.change_reason', p_reason, true);
  update public.documents
  set deleted_at = now(), deleted_by = auth.uid(), deleted_reason = p_reason
  where id = p_document_id and deleted_at is null;
  if not found then
    raise exception 'Document not found' using errcode = 'P0002', hint = 'user';
  end if;
end $$;
