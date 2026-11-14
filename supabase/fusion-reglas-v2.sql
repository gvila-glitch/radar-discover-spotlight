-- ESTADO: aplicado A MANO en el editor de SQL de Lovable el 15 nov 2026 (comprobado: clave 'marina valverde', UTF8).
-- PENDIENTE: registrarlo como migración (pedírselo a Lovable en el próximo cambio de base de datos). Es idempotente
-- (create or replace), así que volver a aplicarlo no cambia nada.
-- Se carga después de drizzle/migrations/0015_fusion_alertas_fuentes.sql en src/lib/fusionAlertas.integration.test.ts.
-- v2: corrige que "Juan Valverde" se combinara con "Juan Carlos Valverde" y "Marina Valverde (política)" con "(cantante)",
-- y hace el paso a minúsculas independiente de la codificación. Solo cambian estas cuatro funciones (la última, para no combinar homónimas ambiguas).

-- 1) Clave de un nombre: sin prefijo [SIN DISCOVER]/[PRUEBA], sin paréntesis "(cantante)", sin tildes ni mayúsculas.
--    Las mayúsculas A-Z se pasan a minúsculas en un paso aparte, solo con caracteres ASCII, para que no dependa de
--    cómo cuente la base de datos los caracteres con tilde.
create or replace function public.clave_entidad(texto text)
returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(regexp_replace(
    translate(
      translate(
        regexp_replace(regexp_replace(coalesce(texto, ''), '^\[(PRUEBA|SIN DISCOVER)\]\s*', '', 'i'), '\s*\([^)]*\)', '', 'g'),
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'),
      'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝàáâãäåçèéêëìíîïðñòóôõöøùúûüýÿĀāĂăĄąĆćĈĉĊċČčĎďĐđĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĨĩĪīĬĭĮįİıĴĵĶķĹĺĻļĽľŁłŃńŅņŇňŌōŎŏŐőŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽž', 'aaaaaaceeeeiiiidnoooooouuuuyaaaaaaceeeeiiiidnoooooouuuuyyaaaaaaccccccccddddeeeeeeeeeegggggggghhiiiiiiiiiijjkkllllllllnnnnnnoooooorrrrrrssssssssttttuuuuuuuuuuuuwwyyyzzzzzz'),
    '[^a-z0-9#]+', ' ', 'g'), '\s+', ' ', 'g'));
$$;

-- 1b) Lo que dicen los paréntesis de un nombre ("cantante", "política"...), normalizado. Vacío si no tiene.
create or replace function public.parentesis_entidad(texto text)
returns text language sql immutable set search_path = '' as $$
  select coalesce(string_agg(public.clave_entidad(m[1]), ' ' order by ord), '')
  from regexp_matches(coalesce(texto, ''), '\(([^)]*)\)', 'g') with ordinality as t(m, ord);
$$;

-- 2) ¿Dos nombres son la misma cosa?
--    - Si los dos llevan paréntesis y dicen cosas distintas ("Marina Valverde (política)" y "(cantante)"): no.
--    - Iguales, o con las mismas palabras (sin artículos ni orden): sí.
--    - Si el corto es UNA palabra, debe ser la última del largo (el apellido: "abascal" en "santiago abascal",
--      pero no "pedro" en "pedro sanchez") y tener al menos 5 letras.
--    - Si el corto tiene varias palabras, deben aparecer SEGUIDAS y en orden en el largo ("isabel diaz" en
--      "isabel diaz ayuso", pero no "juan valverde" en "juan carlos valverde").
create or replace function public.entidades_equivalentes(a text, b text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  ka text := public.clave_entidad(a);
  kb text := public.clave_entidad(b);
  pa text := public.parentesis_entidad(a);
  pb text := public.parentesis_entidad(b);
  vacias constant text[] := array['de','del','la','el','los','las','y','e','en','con','por','para','al'];
  oa text[];
  ob text[];
  ta text[];
  tb text[];
  corto_ord text[];
  largo_ord text[];
  cantidad_corto integer;
  cantidad_largo integer;
  i integer;
begin
  if ka = '' or kb = '' then return false; end if;
  if pa <> '' and pb <> '' and pa <> pb then return false; end if;
  if ka = kb then return true; end if;
  select coalesce(array_agg(t order by pos), '{}'::text[]) into oa
    from unnest(string_to_array(ka, ' ')) with ordinality as u(t, pos) where length(t) >= 3 and t <> all (vacias);
  select coalesce(array_agg(t order by pos), '{}'::text[]) into ob
    from unnest(string_to_array(kb, ' ')) with ordinality as u(t, pos) where length(t) >= 3 and t <> all (vacias);
  select coalesce(array_agg(distinct x), '{}'::text[]) into ta from unnest(oa) as x;
  select coalesce(array_agg(distinct x), '{}'::text[]) into tb from unnest(ob) as x;
  if cardinality(ta) = 0 or cardinality(tb) = 0 then return false; end if;
  if ta @> tb and tb @> ta then return true; end if;
  if cardinality(ta) <= cardinality(tb) then
    corto_ord := oa; largo_ord := ob;
  else
    corto_ord := ob; largo_ord := oa;
  end if;
  cantidad_corto := cardinality(corto_ord);
  cantidad_largo := cardinality(largo_ord);
  if length(array_to_string(corto_ord, '')) < 5 then return false; end if;
  if cantidad_corto = 1 then
    return corto_ord[1] = largo_ord[cantidad_largo];
  end if;
  for i in 1 .. (cantidad_largo - cantidad_corto + 1) loop
    if largo_ord[i : i + cantidad_corto - 1] = corto_ord then return true; end if;
  end loop;
  return false;
end;
$$;

-- 3) Busca una alerta de las últimas 24 h sobre lo mismo y, si la candidata aporta algo nuevo, se lo añade.
--    Devuelve null si no hay coincidencia clara (si hay varias parecidas y ninguna idéntica, es ambigua:
--    no se combina). Devuelve {"resultado":"combinada",...} o {"resultado":"ya_avisada",...}.
create or replace function public.fusionar_alerta_reciente(fila jsonb, instante timestamptz)
returns jsonb language plpgsql set search_path = '' as $$
declare
  nombre text := coalesce(fila->>'entidad', '');
  clave text := public.clave_entidad(coalesce(fila->>'entidad', ''));
  ids bigint[];
  exactas bigint[];
  destino bigint;
  actual public.alertas%rowtype;
  x_pos integer;
  x_des timestamptz;
  trends_vol text;
  w_vis integer;
  w_rat numeric;
  aporta_x boolean := false;
  aporta_trends boolean := false;
  aporta_wiki boolean := false;
  fuentes text[] := '{}'::text[];
begin
  if clave = '' then return null; end if;
  select array_agg(a.id order by a.id) into ids from public.alertas a
    where a.creada_en >= instante - interval '24 hours' and public.entidades_equivalentes(a.entidad, nombre);
  if ids is null then return null; end if;
  -- «Idénticas»: mismo nombre y también los mismos paréntesis. Con dos homónimas ("(política)" y "(cantante)") y una
  -- candidata sin paréntesis no hay ninguna idéntica: es ambiguo y no se combina.
  select array_agg(a.id order by a.id) into exactas from public.alertas a
    where a.id = any (ids) and public.clave_entidad(a.entidad) = clave
      and public.parentesis_entidad(a.entidad) = public.parentesis_entidad(nombre);
  if exactas is not null then
    destino := exactas[cardinality(exactas)];
  elsif cardinality(ids) = 1 then
    destino := ids[1];
  else
    return null;
  end if;
  select * into actual from public.alertas where id = destino for update;

  if (fila->>'x_posicion') ~ '^[0-9]{1,3}$' then x_pos := (fila->>'x_posicion')::integer; end if;
  if (fila->>'x_desde') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:?[0-9]{2})$' then
    begin
      x_des := (fila->>'x_desde')::timestamptz;
    exception when others then
      x_des := null;
    end;
  end if;
  if x_pos is not null and actual.x_posicion is null then
    aporta_x := true;
    fuentes := array_append(fuentes, 'X (puesto ' || x_pos::text || ')');
  end if;

  trends_vol := nullif(trim(coalesce(fila->>'trends_crecimiento', '')), '');
  if trends_vol is not null and coalesce(fila->>'trends_activo', 'true') <> 'false'
     and (not actual.trends_activo or actual.trends_crecimiento is null) then
    aporta_trends := true;
    fuentes := array_append(fuentes, 'Google Trends (' || trends_vol || ')');
  end if;

  if (fila->>'wikipedia_visitas') ~ '^[0-9]{1,9}$' then w_vis := (fila->>'wikipedia_visitas')::integer; end if;
  if (fila->>'wikipedia_ratio') ~ '^[0-9]{1,6}(\.[0-9]+)?$' then w_rat := (fila->>'wikipedia_ratio')::numeric; end if;
  if w_rat is not null and actual.wikipedia_ratio is null then
    aporta_wiki := true;
    fuentes := array_append(fuentes, 'Wikipedia (×' || w_rat::text || ')');
  end if;

  if not (aporta_x or aporta_trends or aporta_wiki) then
    return jsonb_build_object('resultado', 'ya_avisada', 'id', destino);
  end if;

  update public.alertas a set
    x_posicion = case when aporta_x then x_pos else a.x_posicion end,
    x_desde = case when aporta_x then x_des else a.x_desde end,
    trends_activo = case when aporta_trends then true else a.trends_activo end,
    trends_crecimiento = case when aporta_trends then trends_vol else a.trends_crecimiento end,
    wikipedia_visitas = case when aporta_wiki then coalesce(w_vis, a.wikipedia_visitas) else a.wikipedia_visitas end,
    wikipedia_ratio = case when aporta_wiki then w_rat else a.wikipedia_ratio end,
    contexto = a.contexto || ' · También en ' || array_to_string(fuentes, ', '),
    seccion_sugerida = case
      when coalesce(trim(a.seccion_sugerida), '') in ('', 'Sin sugerir')
       and coalesce(trim(fila->>'seccion_sugerida'), '') not in ('', 'Sin sugerir')
      then fila->>'seccion_sugerida' else a.seccion_sugerida end,
    motivo_afinidad = case
      when a.motivo_afinidad like 'Sin %' and coalesce(fila->>'motivo_afinidad', '') like 'Encaja%'
      then fila->>'motivo_afinidad' else a.motivo_afinidad end
  where a.id = destino;
  return jsonb_build_object('resultado', 'combinada', 'id', destino, 'fuentes', to_jsonb(fuentes));
end;
$$;

revoke all on function public.clave_entidad(text) from public, anon, authenticated;
revoke all on function public.parentesis_entidad(text) from public, anon, authenticated;
revoke all on function public.entidades_equivalentes(text, text) from public, anon, authenticated;
revoke all on function public.fusionar_alerta_reciente(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.clave_entidad(text) to service_role;
grant execute on function public.parentesis_entidad(text) to service_role;
grant execute on function public.entidades_equivalentes(text, text) to service_role;
grant execute on function public.fusionar_alerta_reciente(jsonb, timestamptz) to service_role;
