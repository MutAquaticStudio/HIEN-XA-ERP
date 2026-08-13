insert into storage.buckets (id, name, public)
values ('erp-attachments', 'erp-attachments', false)
on conflict (id) do update
set public = false;
