-- Radar Discover: preparado para Supabase. NO ejecutado todavía.
create table public.alertas (
  id bigint generated always as identity primary key,
  creada_en timestamptz not null default now(),
  entidad text not null,
  contexto text not null default '',
  prioridad text not null check (prioridad in ('alta','media')),
  x_posicion int,
  x_desde timestamptz,
  trends_activo boolean not null default false,
  trends_crecimiento text,
  medios_discover int not null default 0,
  medios_lista text[] not null default '{}',
  titulares_seo jsonb not null default '[]',
  angulo text not null default '',
  seccion_sugerida text not null default '',
  motivo_afinidad text not null default '',
  estado text not null default 'pendiente' check (estado in ('pendiente','util','ruido','publicada')),
  pieza_url text,
  estado_actualizado_en timestamptz,
  estado_por text
);

create table public.equipo (email text primary key);

create or replace function public.es_equipo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.equipo where email = auth.jwt()->>'email');
$$;

alter table public.alertas enable row level security;
alter table public.equipo enable row level security;

revoke all on public.alertas from anon;
revoke all on public.equipo from anon;
revoke all on public.equipo from authenticated;
revoke execute on function public.es_equipo() from anon;
grant execute on function public.es_equipo() to authenticated;

grant select on public.alertas to authenticated;
revoke update on public.alertas from authenticated;
grant update (estado, pieza_url, estado_actualizado_en, estado_por) on public.alertas to authenticated;

create policy "equipo lee alertas" on public.alertas for select to authenticated using (public.es_equipo());
create policy "equipo valora alertas" on public.alertas for update to authenticated
  using (public.es_equipo()) with check (public.es_equipo());

-- public.equipo sin políticas: solo editable desde el panel de Supabase.
