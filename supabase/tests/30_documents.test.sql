\set ON_ERROR_STOP on
set client_min_messages = notice;
begin;

do $$
declare
  juan uuid := t.emp('DEMO-0005'); ana uuid := t.emp('DEMO-0006');
  v_doc uuid; v_doc2 uuid; v int; v_path text;
begin
  -- ===== storage upload rules =====
  perform t.as_user('juan.delacruz@demo.prc3.example');
  insert into storage.objects (bucket_id, name) values ('personnel-documents', juan || '/diploma-v1.pdf');
  perform t.ok(true, 'employee can upload into own folder');
  perform t.fails(format('insert into storage.objects (bucket_id, name) values (''personnel-documents'', %L)', ana || '/evil.pdf'),
                  'employee cannot upload into a colleague''s folder');
  perform t.affects(format('update storage.objects set name = %L where name = %L', ana || '/moved.pdf', juan || '/diploma-v1.pdf'),
                    0, 'stored objects cannot be moved/updated (no update policy)');
  perform t.ok(t.count(format('select 1 from storage.objects where name = %L', juan || '/diploma-v1.pdf')) = 0,
               'an unregistered upload is not readable (not yet a document)');

  -- ===== registering documents =====
  v_path := juan || '/diploma-v1.pdf';
  perform t.fails(format('select public.create_document(%L,''DIPLOMA'',''x'',null,null,null,null,null,null,%L,''d.pdf'',''application/pdf'',100,%L)',
                         ana, v_path, repeat('d', 64)), 'cannot register a document for another employee', '42501');
  perform t.fails(format('select public.create_document(%L,''DIPLOMA'',''x'',null,null,null,null,null,null,%L,''d.pdf'',''application/pdf'',100,%L)',
                         juan, juan || '/missing.pdf', repeat('d', 64)), 'cannot register a path that was never uploaded', '22023');
  perform t.fails(format('select public.create_document(%L,''DIPLOMA'',''x'',null,null,null,null,null,null,%L,''d.exe'',''application/x-msdownload'',100,%L)',
                         juan, v_path, repeat('d', 64)), 'disallowed file type rejected', '22023');
  perform t.fails(format('select public.create_document(%L,''DIPLOMA'',''x'',null,null,null,null,null,null,%L,''d.pdf'',''application/pdf'',%s,%L)',
                         juan, v_path, 50 * 1024 * 1024, repeat('d', 64)), 'oversized file rejected', '22023');
  perform t.fails(format('select public.create_document(%L,''NOPE'',''x'',null,null,null,null,null,null,%L,''d.pdf'',''application/pdf'',100,%L)',
                         juan, v_path, repeat('d', 64)), 'unknown category rejected', '22023');
  v_doc := public.create_document(juan, 'DIPLOMA', 'BS Public Administration diploma', '2015-04-20', 'Demo State University', null, null,
                                  null, null, v_path, 'diploma.pdf', 'application/pdf', 4096, repeat('d', 64));
  perform t.ok((select status from public.documents where id = v_doc) = 'for_review', 'employee upload starts as For Review');
  perform t.ok((select doc_no from public.documents where id = v_doc) ~ '^DOC-[0-9]{4}-[0-9]{6}$', 'document number generated');
  perform t.ok(t.count(format('select 1 from storage.objects where name = %L', v_path)) = 1, 'registered file is readable by its owner');
  perform t.fails(format('insert into public.documents (employee_id, category_code, title) values (%L, ''OTHER'', ''direct'')', juan),
                  'documents cannot be inserted directly (must use the audited function)', '42501');
  perform t.fails(format('update public.documents set status = ''verified'' where id = %L', v_doc), 'employee cannot self-verify via direct update', '42501');
  perform t.fails(format('select public.set_document_status(%L, ''verified'', null)', v_doc), 'employee cannot self-verify', '42501');

  -- ===== visibility =====
  perform t.as_user('analiza.bautista@demo.prc3.example');
  perform t.ok(t.count(format('select 1 from public.documents where id = %L', v_doc)) = 0, 'colleague cannot see the document');
  perform t.ok(t.count(format('select 1 from public.document_versions where document_id = %L', v_doc)) = 0, 'colleague cannot see its versions');
  perform t.ok(t.count(format('select 1 from storage.objects where name = %L', v_path)) = 0, 'colleague cannot read the stored file (storage RLS)');
  perform t.fails(format('select public.add_document_version(%L,%L,''x.pdf'',''application/pdf'',10,%L,''hack'')', v_doc, v_path, repeat('e', 64)), 'colleague cannot add versions', '42501');
  perform t.fails(format('select public.log_event(''document.downloaded'',''document'',''documents'',%L)', v_doc), 'cannot forge a download event for an unreadable document', '42501');
  perform t.as_user('lorna.dizon@demo.prc3.example');
  perform t.ok(t.count(format('select 1 from public.documents where id = %L', v_doc)) = 0, 'supervisor cannot see team personnel documents');
  perform t.as_user('eduardo.pascual@demo.prc3.example');
  perform t.ok(t.count(format('select 1 from public.documents where id = %L', v_doc)) = 0, 'auditor has no default document access');

  -- ===== HR review + versioning =====
  perform t.as_user('paolo.mercado@demo.prc3.example');
  perform t.ok(t.count(format('select 1 from storage.objects where name = %L', v_path)) = 1, 'HR can read the stored file');
  perform t.fails(format('select public.set_document_status(%L, ''verified'', null)', v_doc), 'HR staff cannot verify documents (HR admin only)', '42501');
  perform t.as_user('teresita.navarro@demo.prc3.example');
  perform public.set_document_status(v_doc, 'verified', 'Original sighted');
  perform t.fails(format('select public.set_document_status(%L, ''rejected'', null)', v_doc), 'rejection requires remarks', '22023');

  perform t.as_user('juan.delacruz@demo.prc3.example');
  v_path := juan || '/diploma-v2.pdf';
  insert into storage.objects (bucket_id, name) values ('personnel-documents', v_path);
  perform t.fails(format('select public.add_document_version(%L,%L,''d2.pdf'',''application/pdf'',5000,%L,'''')', v_doc, v_path, repeat('f', 64)), 'a reason is required to replace a document', '22023');
  perform t.fails(format('select public.add_document_version(%L,%L,''d2.pdf'',''application/pdf'',5000,%L,''Better scan'')', v_doc, v_path, repeat('d', 64)), 'identical file is rejected as duplicate version', '23505');
  v := public.add_document_version(v_doc, v_path, 'diploma-rescan.pdf', 'application/pdf', 5000, repeat('f', 64), 'Better scan');
  perform t.ok(v = 2, 'second upload becomes version 2');
  perform t.ok((select status from public.documents where id = v_doc) = 'for_review', 'replacing a verified document returns it to For Review');
  perform t.ok(t.count(format('select 1 from public.document_versions where document_id = %L', v_doc)) = 2, 'both versions are kept');
  perform t.ok((select string_agg(version_no || ':' || coalesce(change_reason, ''), ' | ' order by version_no) from public.document_versions where document_id = v_doc) = '1:Initial upload | 2:Better scan', 'version history keeps who/why');
  perform t.fails(format('update public.document_versions set file_name = ''x'' where document_id = %L', v_doc), 'versions cannot be modified by users', '42501');
  perform t.as_admin();
  perform t.fails(format('update public.document_versions set file_name = ''x'' where document_id = %L', v_doc), 'versions are immutable even for administrators', '42501');
  perform t.fails(format('delete from public.document_versions where document_id = %L', v_doc), 'versions cannot be deleted', '42501');

  -- ===== duplicate detection feeds the data-quality dashboard =====
  perform t.as_user('juan.delacruz@demo.prc3.example');
  v_path := juan || '/copy.pdf';
  insert into storage.objects (bucket_id, name) values ('personnel-documents', v_path);
  v_doc2 := public.create_document(juan, 'OTHER', 'Same file again', null, null, null, null, null, null, v_path, 'copy.pdf', 'application/pdf', 5000, repeat('f', 64));
  perform t.as_user('paolo.mercado@demo.prc3.example');
  perform t.ok(t.count('select 1 from public.data_quality_report() where check_code = ''DUPLICATE_DOCUMENT'' and employee_no = ''DEMO-0005''') = 1, 'duplicate file across documents is flagged');

  -- ===== deletion is soft, privileged and reasoned =====
  perform t.fails(format('select public.delete_document(%L, ''cleanup'')', v_doc2), 'HR staff cannot delete documents', '42501');
  perform t.as_user('teresita.navarro@demo.prc3.example');
  perform t.fails(format('select public.delete_document(%L, '' '')', v_doc2), 'a reason is required to delete', '22023');
  perform public.delete_document(v_doc2, 'Duplicate upload');
  perform t.as_user('juan.delacruz@demo.prc3.example');
  perform t.ok(t.count(format('select 1 from public.documents where id = %L', v_doc2)) = 0, 'deleted document disappears for the employee');
  perform t.as_user('teresita.navarro@demo.prc3.example');
  perform t.ok((select deleted_at from public.documents where id = v_doc2) is not null, 'records managers still see it, marked deleted');
  perform t.ok(t.count(format('select 1 from public.document_versions where document_id = %L', v_doc2)) = 1, 'file versions are retained after delete');
end $$;

rollback;
select 'Document tests passed' as result;
