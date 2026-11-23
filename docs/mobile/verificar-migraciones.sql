-- Copyright (c) 2026 Dinovance
-- SOLO LECTURA. Pegar en el SQL Editor de Supabase (produccion). No modifica nada.
-- Dice, por migracion nueva, si sus objetos ya existen (aplicada) o no (falta).
with chequeo(orden, migracion, objeto, existe) as (values
  (1, '20261121120000 observabilidad_errores_cliente', 'tabla client_errors',            to_regclass('public.client_errors') is not null),
  (1, '20261121120000 observabilidad_errores_cliente', 'funcion report_client_error',    to_regprocedure('public.report_client_error(text,text,text,text,text,text)') is not null),
  (1, '20261121120000 observabilidad_errores_cliente', 'funcion purge_observability',    to_regprocedure('public.purge_observability(integer)') is not null),
  (2, '20261121130000 observabilidad_eventos_seguridad','tabla security_events',         to_regclass('public.security_events') is not null),
  (2, '20261121130000 observabilidad_eventos_seguridad','funcion security_overview',     to_regprocedure('public.security_overview(integer)') is not null),
  (3, '20261121140000 push_tokens_nativos',            'tabla native_push_tokens',       to_regclass('public.native_push_tokens') is not null),
  (4, '20261121150000 ingesta_seguridad_gateway',      'rol sec_ingest',                 exists (select 1 from pg_roles where rolname = 'sec_ingest')),
  (4, '20261121150000 ingesta_seguridad_gateway',      'funcion ingest_security_event',  to_regprocedure('public.ingest_security_event(text,text,text,jsonb)') is not null),
  (5, '20261121160000 reporte_error_sin_eventos_anonimos', 'report_client_error exige sesion',
        coalesce((select prosrc like '%auth.uid() is null%' from pg_proc where oid = to_regprocedure('public.report_client_error(text,text,text,text,text,text)')), false)),
  (6, '20261121170000 seguridad_endurece_observabilidad',  'trigger/funcion de tope por persona', to_regprocedure('public.security_events_app_throttle()') is not null),
  (7, '20261121180000 ingesta_detalle_numerico',       'ingesta valida window_s',
        coalesce((select prosrc like '%window_s%' and prosrc like '%jsonb_typeof%' from pg_proc where oid = to_regprocedure('public.ingest_security_event(text,text,text,jsonb)')), false)),
  (8, '20261122100000 alerta_gasto_mayor',             'tabla big_spend_alert_prefs',    to_regclass('public.big_spend_alert_prefs') is not null),
  (8, '20261122100000 alerta_gasto_mayor',             'funcion set_big_spend_alert',    to_regprocedure('public.set_big_spend_alert(boolean,bigint)') is not null),
  (9, '20261123120000 gasto_con_tarjeta',              'columna expenses.payment_method', exists (select 1 from information_schema.columns where table_schema='public' and table_name='expenses' and column_name='payment_method')),
  (9, '20261123120000 gasto_con_tarjeta',              'columna expenses.card_debt_id',   exists (select 1 from information_schema.columns where table_schema='public' and table_name='expenses' and column_name='card_debt_id')),
  (9, '20261123120000 gasto_con_tarjeta',              'columna debts.reported_balance',  exists (select 1 from information_schema.columns where table_schema='public' and table_name='debts' and column_name='reported_balance')),
  (9, '20261123120000 gasto_con_tarjeta',              'trigger expenses_tarjeta_valida', exists (select 1 from pg_trigger where tgname = 'expenses_tarjeta_valida')),
  (0, 'PREVIA 20261102120000 seguridad_endurece',      'columna expenses.notified_at',   exists (select 1 from information_schema.columns where table_schema='public' and table_name='expenses' and column_name='notified_at')),
  (0, 'PREVIA 20261023120000 admin_endurecido',        'funcion admin_status',           to_regprocedure('public.admin_status()') is not null)
)
select migracion, objeto, case when existe then 'SI' else 'FALTA' end as estado
from chequeo order by orden, migracion, objeto;
