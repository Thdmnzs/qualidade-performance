-- =====================================================================
-- Foto de perfil (armazenamento do Supabase).
--
-- Regras (05/10/2026):
--   * Espaço PRIVADO "avatares": a tela recebe links temporários, nunca um
--     endereço público.
--   * Um arquivo por pessoa: <id do cadastro>/avatar.webp. Cada um só envia,
--     troca e remove a própria foto; o ADM pode ver e remover qualquer uma.
--   * Só WebP de até 2 MB (o navegador recorta, reduz a 256 x 256 px e tira os
--     metadados, como o local onde a foto foi tirada, antes de enviar). Isso
--     também barra, no servidor, arquivos disfarçados de imagem (ex.: SVG com código).
--   * Quem vê: a própria pessoa e o ADM. O Ranking entra quando existir.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', false, 2097152, array['image/webp'])
on conflict (id) do update
   set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Ver: a própria foto, ou qualquer uma para o ADM.
create policy "avatares_ver" on storage.objects for select to authenticated
  using (bucket_id = 'avatares'
         and ((storage.foldername(name))[1] = public.current_employee_id()::text or public.is_admin(auth.uid())));

-- Enviar e trocar: só no próprio caminho, com o nome exato (nada de outros arquivos na pasta).
create policy "avatares_enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatares' and name = public.current_employee_id()::text || '/avatar.webp');

create policy "avatares_trocar" on storage.objects for update to authenticated
  using (bucket_id = 'avatares' and name = public.current_employee_id()::text || '/avatar.webp')
  with check (bucket_id = 'avatares' and name = public.current_employee_id()::text || '/avatar.webp');

-- Remover: a própria foto, ou qualquer uma pelo ADM (foto inadequada).
create policy "avatares_remover" on storage.objects for delete to authenticated
  using (bucket_id = 'avatares'
         and (name = public.current_employee_id()::text || '/avatar.webp' or public.is_admin(auth.uid())));
