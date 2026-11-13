-- Data-only migration applied through the data query tool.
insert into public.config (clave, valor) values
  ('perfil_editorial', ''), ('max_alertas_dia', '8'),
  ('hora_inicio', '7'), ('hora_fin', '24'),
  ('umbral_alta_medios', '2'), ('umbral_media_medios', '5')
on conflict (clave) do nothing;
