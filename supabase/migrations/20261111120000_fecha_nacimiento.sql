-- Fecha de nacimiento en el perfil.
-- Se pide para confirmar que la persona es mayor de edad (los términos exigen 18 años) y para ajustar
-- los consejos a su etapa de vida. Es un dato privado: el perfil solo lo lee su dueño (profiles_select).
--
-- Queda opcional en la base para no romper los perfiles que ya existen; la app la pide al editar el perfil
-- y la recuerda en Inicio mientras falte.

alter table public.profiles add column birth_date date;

-- La persona puede corregir su propia fecha (la política profiles_update ya limita a su fila)
grant update (birth_date) on public.profiles to authenticated;

-- Es un trigger (no un CHECK) porque depende de «hoy»: un CHECK con now() rompería al restaurar respaldos.
create function public.check_fecha_nacimiento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  hoy date := (now() at time zone 'America/Santiago')::date;
begin
  if new.birth_date is null then
    return new;
  end if;
  if new.birth_date > hoy then
    raise exception 'La fecha de nacimiento no puede ser futura' using errcode = 'check_violation';
  end if;
  if new.birth_date > (hoy - interval '18 years')::date then
    raise exception 'Debes ser mayor de 18 años' using errcode = 'check_violation';
  end if;
  if new.birth_date < (hoy - interval '111 years')::date then
    raise exception 'Revisa el año de nacimiento' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger profiles_fecha_nacimiento before insert or update of birth_date on public.profiles
  for each row execute function public.check_fecha_nacimiento();
