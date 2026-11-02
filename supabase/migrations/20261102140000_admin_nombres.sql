-- Panel de administración: nombre del hogar y nombre de cada persona.
--
-- Antes la lista no traía nombres (solo un código y una referencia opaca). Para poder gestionar hogares de verdad, ahora trae:
--   · el nombre del hogar (households.name)
--   · el nombre con que cada persona aparece en su hogar (members.display_name)
-- Sigue SIN traer correos, user_id, montos, deudas, sueldos ni nada financiero.
-- Como son datos personales, cada consulta de la lista queda en admin_audit (una vez cada 10 minutos por administrador,
-- para que el registro no se llene con recargas).

drop function if exists public.admin_households();

create function public.admin_households()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_mine uuid;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select household_id into v_mine from public.members where user_id = v_me and left_at is null;

  if not exists (
    select 1 from public.admin_audit
    where admin_id = v_me and action = 'view_households' and at > now() - interval '10 minutes'
  ) then
    insert into public.admin_audit (admin_id, action, detail)
    values (v_me, 'view_households', jsonb_build_object('fields', jsonb_build_array('household_name', 'member_name')));
  end if;

  select coalesce(jsonb_agg(t order by t.last_activity), '[]'::jsonb) into v_result
  from (
    select
      h.id,
      h.name,
      left(h.id::text, 8) as code,
      h.created_at,
      m.active_members,
      greatest(h.created_at, coalesce(a.last_at, h.created_at)) as last_activity,
      coalesce(a.expenses, 0) as expenses,
      true as deletable,
      m.members
    from public.households h
    cross join lateral (
      select
        count(*) filter (where left_at is null) as active_members,
        coalesce(jsonb_agg(jsonb_build_object(
          'ref', left(encode(sha256(convert_to(mm.user_id::text || ':' || mm.household_id::text, 'UTF8')), 'hex'), 20),
          'name', mm.display_name,
          'joined_at', mm.joined_at
        ) order by mm.joined_at) filter (where mm.left_at is null), '[]'::jsonb) as members
      from public.members mm where mm.household_id = h.id
    ) m
    cross join lateral (
      select count(*) as expenses, max(created_at) as last_at from public.expenses where household_id = h.id
    ) a
    where h.id is distinct from v_mine
    order by greatest(h.created_at, coalesce(a.last_at, h.created_at))
    limit 200
  ) t;
  return v_result;
end;
$$;

revoke all on function public.admin_households() from public, anon;
grant execute on function public.admin_households() to authenticated;
