-- Existing production storage inventory was empty on 2026-09-10.
-- Images are public game assets; only the server signs writes for verified admins.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-images', 'event-images', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Deliberately no anonymous/authenticated write policy on storage.objects.
