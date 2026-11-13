-- Radar Discover: esquema portable de alertas y acceso al equipo.
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
grant all on public.alertas to service_role;
grant select on public.alertas to authenticated;
alter table public.alertas enable row level security;

create table public.equipo (email text primary key);

grant all on public.equipo to service_role;
alter table public.equipo enable row level security;

create table public.snoop_articulos (id bigint generated always as identity primary key, url text unique not null, medio text not null check (medio !~ '^www\.' and medio !~ '[/ :]'), titular text, entradilla text, alerta text, recibido_en timestamptz default now());
grant all on public.snoop_articulos to service_role;
alter table public.snoop_articulos enable row level security;

create table public.x_tendencias (id bigint generated always as identity primary key, capturado_en timestamptz default now(), posicion int, nombre text, categoria text, publicaciones int default 0);
grant all on public.x_tendencias to service_role;
alter table public.x_tendencias enable row level security;

create table public.trends (id bigint generated always as identity primary key, capturado_en timestamptz default now(), termino text, volumen text, empezo_en timestamptz, noticias jsonb default '[]');
grant all on public.trends to service_role;
alter table public.trends enable row level security;

create table public.config (clave text primary key, valor text, actualizado_en timestamptz default now());
grant all on public.config to service_role;
alter table public.config enable row level security;

create table public.medios_referencia (dominio text primary key, nombre text, top5 boolean default false, activo boolean default true);
grant all on public.medios_referencia to service_role;
alter table public.medios_referencia enable row level security;

create table public.exclusiones (id bigint generated always as identity primary key, tipo text check (tipo in ('tema','categoria')), valor text not null, motivo text, activo boolean default true);
grant all on public.exclusiones to service_role;
alter table public.exclusiones enable row level security;

create table public.feedback (id bigint generated always as identity primary key, alerta_id bigint references public.alertas(id) on delete cascade, usuario text, valoracion text check (valoracion in ('util','ruido','publicada')), canal text check (canal in ('telegram','panel')), creado_en timestamptz default now());
grant all on public.feedback to service_role;
alter table public.feedback enable row level security;

create table public.uso_llm (id bigint generated always as identity primary key, creado_en timestamptz default now(), prompt text check (prompt in ('entidades','afinidad','angulo')), modelo text, tokens_entrada int, tokens_salida int);
grant all on public.uso_llm to service_role;
alter table public.uso_llm enable row level security;

grant usage, select on all sequences in schema public to service_role;
revoke all on public.equipo, public.alertas, public.snoop_articulos, public.x_tendencias, public.trends, public.config, public.medios_referencia, public.exclusiones, public.feedback, public.uso_llm from anon;
revoke all on public.equipo, public.snoop_articulos, public.x_tendencias, public.trends, public.config, public.medios_referencia, public.exclusiones, public.feedback, public.uso_llm from authenticated;
revoke all on all sequences in schema public from anon, authenticated;

create or replace function public.es_equipo()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.equipo where email = auth.jwt()->>'email');
$$;
revoke all on function public.es_equipo() from public, anon;
grant execute on function public.es_equipo() to authenticated, service_role;
revoke update on public.alertas from authenticated;
grant update (estado, pieza_url, estado_actualizado_en, estado_por) on public.alertas to authenticated;
create policy "equipo lee alertas" on public.alertas for select to authenticated using (public.es_equipo());
create policy "equipo valora alertas" on public.alertas for update to authenticated
  using (public.es_equipo()) with check (public.es_equipo());
create index alertas_creada_en_idx on public.alertas (creada_en desc);
create index snoop_recibido_en_idx on public.snoop_articulos (recibido_en);
create index x_capturado_en_idx on public.x_tendencias (capturado_en);
create index trends_capturado_en_idx on public.trends (capturado_en);

create or replace function public.limpiar_snoop()
returns void language sql security definer set search_path = '' as $$
  delete from public.snoop_articulos where recibido_en < now() - interval '30 days';
$$;
revoke all on function public.limpiar_snoop() from public, anon, authenticated;
grant execute on function public.limpiar_snoop() to service_role;
