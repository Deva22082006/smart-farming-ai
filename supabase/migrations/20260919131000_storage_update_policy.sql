create policy "authenticated update leaf-images" on storage.objects
  for update to authenticated
  using (bucket_id = 'leaf-images')
  with check (bucket_id = 'leaf-images');
