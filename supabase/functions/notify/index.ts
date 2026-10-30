import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const ALLOWED = [
  'https://contigo.dinovance.cl',
  'https://nido-finanzas.joseromeroesteban353.workers.dev',
  'http://localhost:5173',
]

function pickKey(legacy: string, multi: string): string {
  const direct = Deno.env.get(legacy)
  if (direct) return direct
  const raw = Deno.env.get(multi)
  if (raw) {
    const parsed = JSON.parse(raw) as Record<string, string>
    if (parsed['default']) return parsed['default']
  }
  throw new Error(`Falta ${legacy}`)
}

const money = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const FIVE_MIN = 5 * 60 * 1000

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? ''
  const cors = {
    'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0],
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply(405, { error: 'method' })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) return reply(401, { error: 'auth' })

    const url = Deno.env.get('SUPABASE_URL')!
    const me = createClient(url, pickKey('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS'), {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const { data: userData, error: userErr } = await me.auth.getUser(authHeader.slice(7))
    if (userErr || !userData.user) return reply(401, { error: 'auth' })
    const uid = userData.user.id

    const { kind, id } = (await req.json()) as { kind?: string; id?: string }
    if (!['expense', 'contribution', 'test'].includes(kind ?? '')) return reply(400, { error: 'kind' })

    const { data: meRow } = await me
      .from('members')
      .select('*')
      .eq('user_id', uid)
      .is('left_at', null)
      .maybeSingle()
    if (!meRow) return reply(403, { error: 'sin hogar' })

    let title = ''
    let body = ''
    let recipients: string[] = []

    if (kind === 'test') {
      title = 'Aviso de prueba'
      body = 'Si ves esto, las notificaciones funcionan.'
      recipients = [uid]
    } else {
      if (typeof id !== 'string') return reply(400, { error: 'id' })
      const { data: others } = await me
        .from('members')
        .select('user_id')
        .eq('household_id', meRow.household_id)
        .neq('user_id', uid)
        // Quien salió del hogar ya no recibe avisos
        .is('left_at', null)
      recipients = (others ?? []).map((m: { user_id: string }) => m.user_id)

      if (kind === 'expense') {
        const { data: e } = await me
          .from('expenses')
          .select('amount, shared, category_id, created_by, created_at')
          .eq('id', id)
          .maybeSingle()
        if (!e || e.created_by !== uid || Date.now() - Date.parse(e.created_at) > FIVE_MIN) {
          return reply(403, { error: 'gasto no válido' })
        }
        const { data: c } = await me.from('categories').select('name').eq('id', e.category_id).maybeSingle()
        // Un gasto personal escondido a la pareja tampoco se le avisa por el celular
        if (!e.shared && meRow.share_personal === false) return reply(200, { sent: 0 })
        title = `${meRow.display_name} registró un gasto`
        body = `${money(e.amount)} en ${c?.name ?? 'una categoría'}${e.shared ? '' : ' (personal)'}`
      } else {
        const { data: k } = await me
          .from('contributions')
          .select('amount, user_id, goal_id, created_at')
          .eq('id', id)
          .maybeSingle()
        if (!k || k.user_id !== uid || Date.now() - Date.parse(k.created_at) > FIVE_MIN) {
          return reply(403, { error: 'aporte no válido' })
        }
        const { data: g } = await me.from('goals').select('name').eq('id', k.goal_id).maybeSingle()
        if (meRow.share_savings === false) return reply(200, { sent: 0 })
        title = `${meRow.display_name} aportó a una meta`
        body = `${money(k.amount)} a ${g?.name ?? 'una meta'}`
      }
    }

    if (recipients.length === 0) return reply(200, { sent: 0 })

    const admin = createClient(url, pickKey('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS'), {
      auth: { persistSession: false },
    })
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth_key')
      .in('user_id', recipients)

    webpush.setVapidDetails(
      Deno.env.get('VAPID_SUBJECT')!,
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!,
    )
    const payload = JSON.stringify({ title, body, url: '/' })
    let sent = 0
    const dead: string[] = []

    await Promise.all(
      (subs ?? []).map(async (s: { id: string; endpoint: string; p256dh: string; auth_key: string }) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
            payload,
            { TTL: 3600 },
          )
          sent++
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) dead.push(s.id)
          else console.error('push error', status, String(err))
        }
      }),
    )

    if (dead.length) await admin.from('push_subscriptions').delete().in('id', dead)
    return reply(200, { sent })
  } catch (e) {
    console.error(e)
    return reply(500, { error: 'internal' })
  }
})