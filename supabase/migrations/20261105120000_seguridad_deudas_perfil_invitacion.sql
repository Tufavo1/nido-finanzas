-- Endurecimiento de seguridad (auditoría del 2026-11-04).
--
--  1. Deudas: nadie toca las deudas personales de la otra persona. Cada quien crea, edita, archiva y borra las suyas;
--     las «de los dos» (sin dueño) las toca cualquiera del hogar. Anotar pagos sigue la misma regla.
--  2. Perfil (profesión, tipo de empleo, dependientes): solo lo lee su dueño. La app prometía esto y la base no lo cumplía.
--  3. Código de invitación: el límite de intentos ahora es atómico (antes se saltaba con peticiones simultáneas)
--     y suma un tope diario.
--  4. Borrar la cuenta exige haber iniciado sesión hace poco, también en el servidor (antes solo lo pedía la pantalla).
--  5. partner_can_see() solo responde por personas de tu propio hogar (antes revelaba la privacidad de cualquier cuenta).

-- =====================================================================
-- 1. Deudas: cada persona toca solo las suyas
-- =====================================================================
drop policy debts_insert on public.debts;
create policy debts_insert on public.debts for insert to authenticated
  with check (
    public.is_member(household_id)
    and (owner_id is null or owner_id = (select auth.uid()))
  );

drop policy debts_update on public.debts;
create policy debts_update on public.debts for update to authenticated
  using (
    public.is_member(household_id)
    and (owner_id is null or owner_id = (select auth.uid()))
  )
  with check (
    public.is_member(household_id)
    and (owner_id is null or owner_id = (select auth.uid()))
  );

drop policy debts_delete on public.debts;
create policy debts_delete on public.debts for delete to authenticated
  using (
    public.is_member(household_id)
    and (owner_id is null or owner_id = (select auth.uid()))
  );

-- Pagos: a nombre propio (ya era así) y solo sobre deudas que la persona puede tocar.
-- El subselect pasa por la RLS de debts, así que una deuda que no ve tampoco la puede pagar.
drop policy debt_payments_insert on public.debt_payments;
create policy debt_payments_insert on public.debt_payments for insert to authenticated
  with check (
    public.is_member(household_id)
    and paid_by = (select auth.uid())
    and exists (
      select 1 from public.debts d
       where d.id = debt_payments.debt_id
         and (d.owner_id is null or d.owner_id = (select auth.uid()))
    )
  );

-- =====================================================================
-- 2. Perfil: solo su dueño
-- =====================================================================
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));

-- =====================================================================
-- 5. partner_can_see: solo personas de mi hogar
-- =====================================================================
create or replace function public.partner_can_see(owner uuid, topic text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select owner is null
      or owner = (select auth.uid())
      or coalesce((
        select case topic
                 when 'debts'    then m.share_debts
                 when 'fixed'    then m.share_fixed
                 when 'personal' then m.share_personal
                 when 'savings'  then m.share_savings
                 else true
               end
          from public.members m
         where m.user_id = owner
           and m.left_at is null
           and m.household_id = (select public.my_household())
         limit 1
      ), true)
$$;

-- =====================================================================
-- 3. Código de invitación: límite de intentos atómico
-- =====================================================================
create or replace function public.join_household(p_code text, p_display_name text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_h     uuid;
  v_color text;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  if public.my_household() is not null then
    raise exception 'Ya perteneces a un hogar';
  end if;

  -- Una persona a la vez: sin este candado, 40 peticiones simultáneas contaban 0 intentos cada una y pasaban todas el límite.
  -- El candado dura hasta el fin de la transacción, así la siguiente petición ya ve los intentos de la anterior.
  perform pg_advisory_xact_lock(hashtextextended('invite:' || v_uid::text, 0));

  delete from public.invite_attempts a where a.at < now() - interval '1 day';
  if (select count(*) from public.invite_attempts a
      where a.user_id = v_uid and a.at > now() - interval '1 hour') >= 10
     or (select count(*) from public.invite_attempts a
         where a.user_id = v_uid and a.at > now() - interval '1 day') >= 30 then
    raise exception 'Demasiados intentos. Espera una hora e inténtalo de nuevo.';
  end if;
  insert into public.invite_attempts (user_id) values (v_uid);

  select h.id into v_h
    from public.households h
   where h.invite_code = upper(replace(trim(p_code), ' ', ''))
     and h.invite_expires_at > now()
   for update;
  if v_h is null
     or (select count(*) from public.members where household_id = v_h and left_at is null) >= 2 then
    return null;
  end if;

  select case when bool_or(color = 'blue') then 'amber' else 'blue' end into v_color
    from public.members where household_id = v_h and left_at is null;

  -- Si ya estuvo en este hogar, se reactiva su fila (y su historial)
  update public.members
     set left_at = null, display_name = trim(p_display_name), color = v_color, joined_at = now()
   where household_id = v_h and user_id = v_uid;
  if not found then
    insert into public.members (household_id, user_id, display_name, color)
    values (v_h, v_uid, trim(p_display_name), v_color);
  end if;

  update public.households set invite_code = null, invite_expires_at = null where id = v_h;
  return v_h;
end;
$$;

-- =====================================================================
-- 4. Borrar la cuenta: sesión iniciada hace poco
-- =====================================================================
-- La app pide la contraseña antes de borrar, y al validarla inicia sesión de nuevo (eso actualiza last_sign_in_at).
-- Con esta revisión, una sesión robada que llame directo a la función tampoco puede borrar la cuenta.
create or replace function public.delete_account()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  if not exists (
    select 1 from auth.users u
     where u.id = v_uid and u.last_sign_in_at > now() - interval '10 minutes'
  ) then
    raise exception 'Confirma tu contraseña de nuevo para borrar tu cuenta' using errcode = '42501';
  end if;
  if public.my_household() is not null then
    perform public.leave_household();
  end if;
  delete from public.push_subscriptions where user_id = v_uid;
  -- Lo que se queda en hogares de pareja: sin el nombre de la persona
  update public.members set display_name = 'Persona que salió' where user_id = v_uid;
  -- Arrastra sesiones, identidades, sueldo, ingresos y perfil (on delete cascade)
  delete from auth.users where id = v_uid;
end;
$$;
