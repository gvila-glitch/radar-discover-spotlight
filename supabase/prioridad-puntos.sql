-- REGISTRADO como migración en drizzle/migrations/0016_registrar_cambios_manuales.sql (16 nov 2026). Este archivo queda como referencia.
-- ESTADO: APLICADO a mano en el editor de SQL (v1 y v2, 16 nov 2026); PENDIENTE de registrar como migración. Idempotente.
--
-- PRIORIDAD POR PUNTOS. Sustituye la regla anterior («alta solo si X y 0–2 medios en Discover») por una puntuación.
-- v2 (16 nov 2026): entiende la opinión de la IA (Encaja (IA, alto) +3; Encaja (IA, medio) +1). Se aplica entero otra vez.
-- La misma fórmula está en src/lib/prioridad.ts (para enseñar el desglose en el panel); si se cambia, en los dos.
--   X: puesto 1–5 +3, 6–15 +2, 16 o más +1; +1 si entró en X como mucho 90 min antes de crearse la alerta.
--   Google Trends: 20.000+ +3, 5.000+ +2, 1.000+ +1.        Wikipedia: ×10 +3, ×5 +2, ×3 +1.
--   Varias fuentes a la vez: dos +1, tres +2.
--   Discover (si hay datos): 0–2 medios +1; 3 o más −2.
--   Encaja con la línea editorial (regla de «sí» o IA «alto») +3; IA «medio» +1; hashtag que no encaja −1.
--   ALTA: 5 puntos o más Y (encaja con la línea editorial O viene de 2 fuentes o más) Y no hay ya 3 o más medios en
--   Discover (alta = «aún llegamos a tiempo»). Si no, media.
-- Un disparador la recalcula al crear la alerta y cada vez que cambian sus datos (al combinar fuentes, en el cruce
-- con Snoop…), así no hay que tocar las funciones que crean o actualizan alertas: lo que pongan en «prioridad» se
-- sustituye por el resultado de la fórmula. Las valoraciones (estado, enlace) no lo activan.

-- Volumen de Trends («2.000+», «20K+», «1,5M+») como número; 0 si no se entiende. Igual que volumenNumerico().
create or replace function public.volumen_numerico(valor text)
returns numeric language sql immutable set search_path = '' as $$
  select coalesce(case
    when m is null then 0
    when m[2] <> '' and m[1] ~ '^[0-9]+([.,][0-9]+)?$' then
      replace(m[1], ',', '.')::numeric * case upper(m[2]) when 'K' then 1000 when 'M' then 1000000 else 1000000000 end
    when m[2] = '' then nullif(regexp_replace(m[1], '[.,]', '', 'g'), '')::numeric
    else 0 end, 0)
  from (select pg_catalog.regexp_match(coalesce(valor, ''), '^\s*([0-9.,]+)\s*([KMBkmb]?)\s*\+?\s*$') as m) s;
$$;

create or replace function public.puntuar_alerta(
  entidad text, creada_en timestamptz, x_posicion integer, x_desde timestamptz, trends_activo boolean,
  trends_crecimiento text, wikipedia_ratio numeric, medios_discover integer, motivo_afinidad text,
  out puntos integer, out prioridad text)
language plpgsql stable set search_path = '' as $$
declare
  volumen numeric;
  fuentes integer;
  afin boolean;
  medio boolean;
begin
  puntos := 0;
  if x_posicion is not null then
    puntos := puntos + case when x_posicion <= 5 then 3 when x_posicion <= 15 then 2 else 1 end;
    if x_desde is not null and creada_en is not null and x_desde >= creada_en - interval '90 minutes' then
      puntos := puntos + 1;
    end if;
  end if;
  volumen := case when coalesce(trends_activo, false) then public.volumen_numerico(trends_crecimiento) else 0 end;
  puntos := puntos + case when volumen >= 20000 then 3 when volumen >= 5000 then 2 when volumen >= 1000 then 1 else 0 end;
  puntos := puntos + case when wikipedia_ratio >= 10 then 3 when wikipedia_ratio >= 5 then 2
                          when wikipedia_ratio >= 3 then 1 else 0 end;
  fuentes := (x_posicion is not null)::integer + coalesce(trends_activo, false)::integer
             + (wikipedia_ratio is not null)::integer;
  if fuentes >= 2 then puntos := puntos + fuentes - 1; end if;
  if coalesce(entidad, '') !~* '^\[SIN DISCOVER\]' then
    puntos := puntos + case when coalesce(medios_discover, 0) <= 2 then 1 else -2 end;
  end if;
  afin := coalesce(motivo_afinidad, '') like 'Encaja por reglas%' or coalesce(motivo_afinidad, '') like 'Encaja (IA, alto)%';
  medio := not afin and coalesce(motivo_afinidad, '') like 'Encaja (IA, medio)%';
  if afin then
    puntos := puntos + 3;
  elsif medio then
    puntos := puntos + 1;
  elsif btrim(regexp_replace(coalesce(entidad, ''), '^\[(PRUEBA|SIN DISCOVER)\]\s*', '', 'i')) like '#%' then
    puntos := puntos - 1;
  end if;
  prioridad := case when puntos >= 5 and (afin or fuentes >= 2)
                         and (coalesce(entidad, '') ~* '^\[SIN DISCOVER\]' or coalesce(medios_discover, 0) <= 2)
                    then 'alta' else 'media' end;
end;
$$;

create or replace function public.alertas_prioridad_por_puntos()
returns trigger language plpgsql set search_path = '' as $$
begin
  select p.prioridad into new.prioridad
  from public.puntuar_alerta(new.entidad, new.creada_en, new.x_posicion, new.x_desde, new.trends_activo,
                             new.trends_crecimiento, new.wikipedia_ratio, new.medios_discover,
                             new.motivo_afinidad) p;
  return new;
end;
$$;

revoke all on function public.volumen_numerico(text) from public, anon;
revoke all on function public.puntuar_alerta(text, timestamptz, integer, timestamptz, boolean, text, numeric, integer, text)
  from public, anon;
revoke all on function public.alertas_prioridad_por_puntos() from public, anon, authenticated;
grant execute on function public.volumen_numerico(text) to authenticated, service_role;
grant execute on function public.puntuar_alerta(text, timestamptz, integer, timestamptz, boolean, text, numeric, integer, text)
  to authenticated, service_role;

drop trigger if exists alertas_prioridad_por_puntos on public.alertas;
create trigger alertas_prioridad_por_puntos
  before insert or update of entidad, creada_en, x_posicion, x_desde, trends_activo, trends_crecimiento,
    wikipedia_ratio, medios_discover, motivo_afinidad, prioridad
  on public.alertas
  for each row execute function public.alertas_prioridad_por_puntos();

-- Recalcula las alertas que ya existen (el disparador se activa al tocar «prioridad»).
update public.alertas set prioridad = prioridad;
