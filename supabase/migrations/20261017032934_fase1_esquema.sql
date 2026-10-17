-- Nido Finanzas · Fase 1 · Esquema, seguridad por hogar y funciones
-- Montos en pesos chilenos enteros (bigint). Un hogar = máximo 2 miembros.

create table public.households (
    id uuid primary key default gen_random_uuid (),
    name text not null check (
        char_length(name) between 1 and 60
    ),
    invite_code text unique,
    created_at timestamptz not null default now()
);

create table public.members (
    household_id uuid not null references public.households (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    display_name text not null check (
        char_length(display_name) between 1 and 40
    ),
    color text not null default 'blue' check (color in ('blue', 'amber')),
    joined_at timestamptz not null default now(),
    primary key (household_id, user_id),
    unique (user_id)
);

create table public.categories (
    id uuid primary key default gen_random_uuid (),
    household_id uuid not null references public.households (id) on delete cascade,
    name text not null check (
        char_length(name) between 1 and 40
    ),
    monthly_budget bigint not null default 0 check (
        monthly_budget >= 0
        and monthly_budget < 10000000000
    ),
    position int not null default 0,
    archived boolean not null default false,
    unique (id, household_id),
    unique (household_id, name)
);

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  category_id  uuid not null,
  amount       bigint not null check (amount > 0 and amount < 10000000000),
  paid_by      uuid not null,
  shared       boolean not null default true,
  note         text check (note is null or char_length(note) <= 120),
  spent_on     date not null default ((now() at time zone 'America/Santiago')::date),
  created_by   uuid not null default auth.uid(),
  created_at   timestamptz not null default now(),
  foreign key (category_id, household_id) references public.categories (id, household_id),
  foreign key (household_id, paid_by)     references public.members (household_id, user_id),
  foreign key (household_id, created_by)  references public.members (household_id, user_id)
);

create table public.goals (
    id uuid primary key default gen_random_uuid (),
    household_id uuid not null references public.households (id) on delete cascade,
    name text not null check (
        char_length(name) between 1 and 60
    ),
    target_amount bigint not null check (
        target_amount > 0
        and target_amount < 10000000000
    ),
    target_date date,
    archived boolean not null default false,
    created_at timestamptz not null default now(),
    unique (id, household_id)
);

create table public.contributions (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  goal_id        uuid not null,
  user_id        uuid not null,
  amount         bigint not null check (amount > 0 and amount < 10000000000),
  contributed_on date not null default ((now() at time zone 'America/Santiago')::date),
  created_at     timestamptz not null default now(),
  foreign key (goal_id, household_id) references public.goals (id, household_id) on delete cascade,
  foreign key (household_id, user_id) references public.members (household_id, user_id)
);

create index expenses_household_date_idx on public.expenses (household_id, spent_on desc);

create index contributions_goal_idx on public.contributions (goal_id);

create index categories_household_idx on public.categories (household_id);

-- Pertenencia al hogar (security definer para evitar recursión en RLS)
create or replace function public.is_member(h uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.household_id = h and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_member (uuid) from public, anon;

grant execute on function public.is_member (uuid) to authenticated;

-- Permisos: partir de cero y conceder columna por columna
revoke all on public.households,
public.members,
public.categories,
public.expenses,
public.goals,
public.contributions
from anon, authenticated;

grant select on public.households to authenticated;

grant update (name) on public.households to authenticated;

grant select on public.members to authenticated;

grant update (display_name) on public.members to authenticated;

grant select, insert on public.categories to authenticated;

grant
update (
    name,
    monthly_budget,
    position,
    archived
) on public.categories to authenticated;

grant select, insert , delete on public.expenses to authenticated;

grant
update (
    category_id,
    amount,
    paid_by,
    shared,
    note,
    spent_on
) on public.expenses to authenticated;

grant select, insert on public.goals to authenticated;

grant
update (
    name,
    target_amount,
    target_date,
    archived
) on public.goals to authenticated;

grant
select,
insert
,
    delete on public.contributions to authenticated;

-- Row Level Security
alter table public.households enable row level security;

alter table public.members enable row level security;

alter table public.categories enable row level security;

alter table public.expenses enable row level security;

alter table public.goals enable row level security;

alter table public.contributions enable row level security;

create policy households_select on public.households for
select to authenticated using (public.is_member (id));

create policy households_update on public.households for
update to authenticated using (public.is_member (id))
with
    check (public.is_member (id));

create policy members_select on public.members for
select to authenticated using (
        public.is_member (household_id)
    );

create policy members_update_self on public.members for
update to authenticated using (user_id = auth.uid ())
with
    check (user_id = auth.uid ());

create policy categories_select on public.categories for
select to authenticated using (
        public.is_member (household_id)
    );

create policy categories_insert on public.categories for
insert
    to authenticated
with
    check (
        public.is_member (household_id)
    );

create policy categories_update on public.categories for
update to authenticated using (
    public.is_member (household_id)
)
with
    check (
        public.is_member (household_id)
    );

create policy expenses_select on public.expenses for
select to authenticated using (
        public.is_member (household_id)
    );

create policy expenses_insert on public.expenses for
insert
    to authenticated
with
    check (
        public.is_member (household_id)
        and created_by = auth.uid ()
    );

create policy expenses_update on public.expenses for
update to authenticated using (
    public.is_member (household_id)
)
with
    check (
        public.is_member (household_id)
    );

create policy expenses_delete on public.expenses for delete to authenticated using (
    public.is_member (household_id)
);

create policy goals_select on public.goals for
select to authenticated using (
        public.is_member (household_id)
    );

create policy goals_insert on public.goals for
insert
    to authenticated
with
    check (
        public.is_member (household_id)
    );

create policy goals_update on public.goals for
update to authenticated using (
    public.is_member (household_id)
)
with
    check (
        public.is_member (household_id)
    );

create policy contributions_select on public.contributions for
select to authenticated using (
        public.is_member (household_id)
    );

create policy contributions_insert on public.contributions for
insert
    to authenticated
with
    check (
        public.is_member (household_id)
    );

create policy contributions_delete on public.contributions for delete to authenticated using (
    public.is_member (household_id)
);

-- Crear hogar / entrar con código / rotar código
create or replace function public.create_household(p_name text, p_display_name text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_id   uuid;
  v_code text;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  if exists (select 1 from public.members where user_id = v_uid) then
    raise exception 'Ya perteneces a un hogar';
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  insert into public.households (name, invite_code)
  values (trim(p_name), v_code)
  returning id into v_id;

  insert into public.members (household_id, user_id, display_name, color)
  values (v_id, v_uid, trim(p_display_name), 'blue');

  insert into public.categories (household_id, name, position)
  select v_id, t.n, t.o
  from unnest(array['Supermercado', 'Hogar y cuentas', 'Transporte', 'Salud', 'Ocio', 'Otros'])
       with ordinality as t(n, o);

  return v_id;
end;
$$;

create or replace function public.join_household(p_code text, p_display_name text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_h   uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  if exists (select 1 from public.members where user_id = v_uid) then
    raise exception 'Ya perteneces a un hogar';
  end if;

  select h.id into v_h
  from public.households h
  where h.invite_code = upper(trim(p_code))
  for update;

  -- Mismo mensaje en ambos casos: no revela si el código existió
  if v_h is null then
    raise exception 'Código inválido o ya utilizado';
  end if;
  if (select count(*) from public.members where household_id = v_h) >= 2 then
    raise exception 'Código inválido o ya utilizado';
  end if;

  insert into public.members (household_id, user_id, display_name, color)
  values (v_h, v_uid, trim(p_display_name), 'amber');

  update public.households set invite_code = null where id = v_h;
  return v_h;
end;
$$;

create or replace function public.rotate_invite_code()
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_h    uuid;
  v_code text;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  select m.household_id into v_h from public.members m where m.user_id = v_uid;
  if v_h is null then
    raise exception 'No perteneces a ningún hogar';
  end if;
  if (select count(*) from public.members where household_id = v_h) >= 2 then
    raise exception 'El hogar ya está completo';
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  update public.households set invite_code = v_code where id = v_h;
  return v_code;
end;
$$;

revoke all on function public.create_household (text, text)
from public, anon;

revoke all on function public.join_household (text, text)
from public, anon;

revoke all on function public.rotate_invite_code ()
from public, anon;

grant
execute on function public.create_household (text, text) to authenticated;

grant
execute on function public.join_household (text, text) to authenticated;

grant
execute on function public.rotate_invite_code () to authenticated;

-- Tiempo real (respeta RLS). Replica identity full para que los DELETE lleguen filtrables.
alter table public.expenses replica identity full;

alter table public.contributions replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime
      add table public.expenses, public.contributions, public.goals, public.categories;
  end if;
end;
$$;