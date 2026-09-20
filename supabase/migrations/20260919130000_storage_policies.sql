-- Storage policies for leaf-images bucket
-- Allows authenticated users to view/create signed URLs for objects in leaf-images
create policy "authenticated read leaf-images" on storage.objects
  for select to authenticated
  using (bucket_id = 'leaf-images');

create policy "authenticated insert leaf-images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'leaf-images');

create policy "authenticated update leaf-images" on storage.objects
  for update to authenticated
  using (bucket_id = 'leaf-images')
  with check (bucket_id = 'leaf-images');
