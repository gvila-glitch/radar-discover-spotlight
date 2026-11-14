-- ESTADO: PENDIENTE de aplicar a mano en el editor de SQL (después de supabase/cruce-snoop-v3.sql) y de registrar como migración.
-- Idempotente (create or replace).

-- v4: el cruce periódico cuenta los artículos desde 3 h antes de crear cada alerta, para que no se pierda nada
-- aunque se ejecute pocas veces al día. Se aplica DESPUÉS de la v3.

-- 3b) CRUCE CON SNOOP. Snoop envía los artículos que están entrando en Discover (tabla snoop_articulos).
--     datos_discover(): para un tema, cuántos medios distintos lo han publicado en las últimas 3 horas, cuáles y con
--     qué titulares. "Snoop vivo" = ha llegado algún artículo en las últimas 2 horas; si no, no sabemos nada y no se toca.
--     Un titular habla del tema si contiene su nombre completo, o su apellido (solo si el tema tiene varias palabras,
--     el apellido tiene 5 o más letras y no es uno muy común).
create or replace function public.datos_discover_desde(nombre text, desde timestamptz, instante timestamptz)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  clave text := public.clave_entidad(coalesce(nombre, ''));
  vacias constant text[] := array['de','del','la','el','los','las','y','e','en','con','por','para','al'];
  comunes constant text[] := array['sanchez','garcia','lopez','martinez','gonzalez','rodriguez','fernandez','perez','gomez','martin','jimenez','ruiz','hernandez','diaz','moreno','alvarez','munoz','romero','alonso','gutierrez','navarro','torres','dominguez','vazquez','ramos','ramirez','serrano','blanco','suarez','molina','morales','ortega','delgado','castro','ortiz','rubio','marin','nunez','medina','garrido','santos','castillo','cortes','lozano','guerrero','prieto','mendez','calvo','gallego','vidal','herrera','flores','iglesias'];
  tokens text[];
  apellido text;
  vivo boolean;
  lista text[];
  titulares jsonb;
  total integer;
begin
  vivo := exists (select 1 from public.snoop_articulos s where s.recibido_en >= instante - interval '2 hours');
  if not vivo or clave = '' or left(clave, 1) = '#' then
    return jsonb_build_object('vivo', vivo, 'medios', 0, 'lista', '[]'::jsonb, 'titulares', '[]'::jsonb);
  end if;
  select coalesce(array_agg(t order by pos), '{}'::text[]) into tokens
    from unnest(string_to_array(clave, ' ')) with ordinality as u(t, pos)
    where length(t) >= 3 and t <> all (vacias);
  if cardinality(tokens) >= 2 then
    apellido := tokens[cardinality(tokens)];
    if length(apellido) < 5 or apellido = any (comunes) then apellido := null; end if;
  end if;
  with c as (
    select s.medio, s.titular, s.recibido_en
    from public.snoop_articulos s
    where s.recibido_en >= desde and s.recibido_en <= instante
      and (position(' ' || clave || ' ' in ' ' || public.clave_entidad(coalesce(s.titular, '')) || ' ') > 0
        or (apellido is not null
            and position(' ' || apellido || ' ' in ' ' || public.clave_entidad(coalesce(s.titular, '')) || ' ') > 0))
  ), medios as (
    select medio, min(recibido_en) as primero from c group by medio
  ), ultimos as (
    select distinct on (medio) medio, titular, recibido_en from c order by medio, recibido_en desc
  )
  select
    coalesce((select array_agg(m.medio order by m.primero) from (select medio, primero from medios order by primero limit 12) m), '{}'::text[]),
    coalesce((select jsonb_agg(jsonb_build_object('medio', u.medio, 'titular', u.titular) order by u.recibido_en desc)
              from (select medio, titular, recibido_en from ultimos order by recibido_en desc limit 3) u), '[]'::jsonb),
    (select count(*) from medios)::integer
  into lista, titulares, total;
  return jsonb_build_object('vivo', true, 'medios', total, 'lista', to_jsonb(lista), 'titulares', titulares);
end;
$$;

--     datos_discover(): la llegada al crear una alerta, con los artículos de las últimas 3 horas.
create or replace function public.datos_discover(nombre text, instante timestamptz)
returns jsonb language sql stable set search_path = '' as $$
  select public.datos_discover_desde(nombre, instante - interval '3 hours', instante);
$$;

--     cruzar_snoop(): revisa las alertas de las últimas 24 h y les añade lo que Snoop haya enviado desde entonces
--     (nunca baja el número de medios), les quita la etiqueta [SIN DISCOVER] y sube a prioridad alta las que tienen señal en X
--     y 0-2 medios. Si Snoop no está vivo no toca nada. Se ejecuta con pg_cron unas pocas veces al día.
create or replace function public.cruzar_snoop(instante timestamptz default clock_timestamp())
returns jsonb language plpgsql set search_path = '' as $$
declare
  a record;
  d jsonb;
  vivo boolean;
  medios_nuevo integer;
  lista_nueva text[];
  titulares_nuevo jsonb;
  prioridad_nueva text;
  revisadas integer := 0;
  actualizadas integer := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(734210, 1);
  vivo := exists (select 1 from public.snoop_articulos s where s.recibido_en >= instante - interval '2 hours');
  if not vivo then
    return jsonb_build_object('snoop_vivo', false, 'revisadas', 0, 'actualizadas', 0);
  end if;
  for a in
    select id, entidad, creada_en, medios_discover, medios_lista, titulares_seo, x_posicion, prioridad
    from public.alertas where creada_en >= instante - interval '24 hours' order by id
  loop
    revisadas := revisadas + 1;
    -- Desde 3 h antes de crear la alerta hasta ahora: así no se pierde nada aunque se ejecute pocas veces al día.
    d := public.datos_discover_desde(a.entidad, a.creada_en - interval '3 hours', instante);
    medios_nuevo := greatest(a.medios_discover, (d->>'medios')::integer);
    lista_nueva := (a.medios_lista || array(
      select m.valor from jsonb_array_elements_text(d->'lista') as m(valor) where m.valor <> all (a.medios_lista)))[1:12];
    titulares_nuevo := coalesce((
      select jsonb_agg(u.e order by u.o, u.ord) from (
        select e, 1 as o, ord from jsonb_array_elements(a.titulares_seo) with ordinality as x(e, ord)
        union all
        select e, 2 as o, ord from jsonb_array_elements(coalesce(d->'titulares', '[]'::jsonb)) with ordinality as y(e, ord)
          where not exists (select 1 from jsonb_array_elements(a.titulares_seo) as z(e2) where z.e2->>'medio' = e->>'medio')
        order by o, ord limit 3
      ) u), '[]'::jsonb);
    prioridad_nueva := case when a.prioridad = 'media' and a.x_posicion is not null and medios_nuevo <= 2 then 'alta' else a.prioridad end;
    update public.alertas t set
      medios_discover = medios_nuevo,
      medios_lista = lista_nueva,
      titulares_seo = titulares_nuevo,
      entidad = regexp_replace(t.entidad, '^\[SIN DISCOVER\]\s*', '', 'i'),
      prioridad = prioridad_nueva
    where t.id = a.id
      and (t.medios_discover <> medios_nuevo
        or t.medios_lista is distinct from lista_nueva
        or t.titulares_seo is distinct from titulares_nuevo
        or t.entidad ~* '^\[SIN DISCOVER\]'
        or t.prioridad is distinct from prioridad_nueva);
    if found then actualizadas := actualizadas + 1; end if;
  end loop;
  return jsonb_build_object('snoop_vivo', true, 'revisadas', revisadas, 'actualizadas', actualizadas);
end;
$$;

revoke all on function public.datos_discover_desde(text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.datos_discover(text, timestamptz) from public, anon, authenticated;
revoke all on function public.cruzar_snoop(timestamptz) from public, anon, authenticated;
grant execute on function public.datos_discover_desde(text, timestamptz, timestamptz) to service_role;
grant execute on function public.datos_discover(text, timestamptz) to service_role;
grant execute on function public.cruzar_snoop(timestamptz) to service_role;
