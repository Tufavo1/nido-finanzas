// Prueba de punta a punta contra el Supabase local (con confirmación de correo y CAPTCHA de prueba):
// 2 hogares aislados, invitación, gastos fijos, ingresos privados, tiempo real privado,
// salir del hogar y borrar la cuenta.
// Requiere: supabase start, npm run dev (puerto 5173) y Google Chrome. Uso: npm run test:e2e
const { chromium } = require('playwright-core')
const { execSync } = require('child_process')

const BASE = 'http://127.0.0.1:5173'
const PW = 'Clave-Segura-2026!'
const run = Date.now()
const mail = (n) => `${n}-${run}@test.cl`
const sql = (q) => execSync(`docker exec supabase_db_nido psql -U postgres -tAc ${JSON.stringify(q)}`).toString().trim()

const waitSql = async (q, expected) => {
  for (let i = 0; i < 30; i++) {
    if (sql(q) === expected) return true
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

const step = (s) => console.log('·', s)
function assert(c, m) {
  if (!c) throw new Error('FALLÓ: ' + m)
  console.log('  ✓', m)
}

async function newPage(browser, name, userAgent) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...(userAgent ? { userAgent, hasTouch: true } : {}) })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(`  [${name} pageerror]`, e.message))
  return page
}

async function mailLink(email) {
  for (let i = 0; i < 40; i++) {
    const r = await (await fetch(`http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent('to:' + email)}`)).json()
    for (const m of r.messages ?? []) {
      const full = await (await fetch(`http://127.0.0.1:54324/api/v1/message/${m.ID}`)).json()
      const u = ((full.HTML + ' ' + full.Text).match(/https?:\/\/[^\s"<>]+/g) ?? [])
        .map((x) => x.replace(/&amp;/g, '&'))
        .find((x) => x.includes('verify') && x.includes('type=signup'))
      if (u) return u
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('no llegó el correo de confirmación a ' + email)
}

async function register(page, email) {
  await page.goto(BASE)
  await page.getByRole('button', { name: 'Crear una cuenta' }).click()
  await page.getByLabel('Correo').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(PW)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await page.getByText('Te enviamos un correo').waitFor({ timeout: 30000 })
  // Confirma el correo y vuelve a iniciar sesión (la app no lee tokens desde la URL)
  const r = await fetch(await mailLink(email), { redirect: 'manual' })
  if (r.status >= 400) throw new Error('confirmación de correo falló: ' + r.status)
  await login(page, email)
  await page.getByText('Armemos tu hogar').waitFor({ timeout: 30000 })
}

async function login(page, email) {
  await page.goto(BASE)
  await page.getByLabel('Correo').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(PW)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

async function createHousehold(page, name) {
  await page.getByLabel('Tu nombre').fill(name)
  await page.getByRole('button', { name: 'Crear hogar' }).last().click()
  await page.getByText(`Hola, ${name}`).waitFor({ timeout: 30000 })
}

const tab = (page, name) => page.getByRole('navigation', { name: 'Principal' }).getByRole('button', { name }).click()

async function addExpense(page, digits, note) {
  await tab(page, 'Registrar')
  for (const d of digits) await page.getByRole('button', { name: d, exact: true }).click()
  await page.getByLabel('Nota').fill(note)
  await page.getByRole('button', { name: 'Guardar gasto' }).click()
  await page.getByText(`Hola,`).waitFor({ timeout: 15000 })
}

;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true })
  try {
    step('Ana se registra (correo + CAPTCHA) y crea su hogar a solas')
    const ana = await newPage(browser, 'ana')
    await register(ana, mail('ana'))
    await createHousehold(ana, 'Ana')
    assert(true, 'Ana entra a su hogar')

    step('Instalar la app: aviso, "Ahora no" y botón en Ajustes')
    const fakeInstall = (page, outcome) =>
      page.evaluate((outcome) => {
        const e = new Event('beforeinstallprompt', { cancelable: true })
        e.prompt = async () => {}
        e.userChoice = Promise.resolve({ outcome })
        window.dispatchEvent(e)
      }, outcome)
    await fakeInstall(ana, 'dismissed')
    await ana.getByText('¿Quieres instalar Contigo?').waitFor({ timeout: 10000 })
    assert(true, 'aparece el aviso para instalar')
    await ana.getByRole('button', { name: 'Ahora no' }).click()
    await ana.getByText(/cuando quieras desde Ajustes/).waitFor({ timeout: 5000 })
    assert((await ana.getByText('¿Quieres instalar Contigo?').count()) === 0, 'con "Ahora no" el aviso se cierra y avisa dónde instalar')
    await ana.reload()
    await ana.getByText('Hola, Ana').waitFor({ timeout: 30000 })
    await fakeInstall(ana, 'accepted')
    await ana.waitForTimeout(500)
    assert((await ana.getByText('¿Quieres instalar Contigo?').count()) === 0, 'tras decir que no, no vuelve a molestar')
    await tab(ana, 'Ajustes')
    await ana.getByText('Permisos y datos').waitFor()
    for (const t of ['Almacenamiento del navegador', 'Verificación anti-bots', 'Conexión a internet', 'Instalar la app', 'Notificaciones']) {
      assert(await ana.getByText(t, { exact: true }).first().isVisible(), `Permisos y datos explica: ${t}`)
    }
    assert((await ana.locator('.need .pill', { hasText: /^Necesario$/ }).count()) === 3 && (await ana.locator('.need .pill', { hasText: /^Opcional$/ }).count()) === 2, '3 cosas necesarias y 2 opcionales')
    await ana.getByRole('button', { name: 'Instalar app' }).click()
    await ana.getByText('¡Contigo quedó instalada!').first().waitFor({ timeout: 5000 })
    assert(true, 'el botón de Ajustes instala la app aunque hayas dicho que no')
    step('Acerca de: versión, copyright y agradecimiento')
    await ana.getByRole('region', { name: 'Acerca de esta app' }).scrollIntoViewIfNeeded()
    const about = ana.getByRole('region', { name: 'Acerca de esta app' })
    assert(await about.getByText(/^\d+\.\d+\.\d+$/).isVisible(), 'muestra la versión')
    assert(await about.getByText(/© 2026(–\d{4})? Dinovance\. Todos los derechos reservados\./).isVisible(), 'muestra el copyright de Dinovance')
    assert(await about.getByText('Gracias por usar Contigo.').isVisible(), 'da las gracias')
    await about.getByRole('button', { name: 'Buscar actualizaciones' }).click()
    await about.getByRole('status').waitFor({ timeout: 10000 })
    assert(true, 'el botón de actualizaciones responde')
    const iphone = await newPage(browser, 'iphone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
    await login(iphone, mail('ana'))
    await iphone.getByText('Añadir a pantalla de inicio').first().waitFor({ timeout: 30000 })
    assert(await iphone.getByRole('button', { name: 'Entendido' }).isVisible(), 'en iPhone explica cómo instalar a mano')
    const login0 = await newPage(browser, 'visita')
    await login0.goto(BASE)
    await login0.getByText('¿Qué necesita Contigo para funcionar?').click()
    assert(await login0.getByText(/no usa cookies de publicidad ni de seguimiento/).isVisible(), 'la pantalla de entrada explica qué se necesita')

    step('Beto se une con el código de invitación')
    await tab(ana, 'Ajustes')
    const code = (await ana.locator('.code').first().textContent()).trim()
    assert(/^[A-HJ-NP-Z2-9]{12}$/.test(code), 'código de 12 caracteres')
    assert(await ana.getByText(/vence el/).isVisible(), 'la invitación muestra su vencimiento')
    const beto = await newPage(browser, 'beto')
    await register(beto, mail('beto'))
    await beto.getByRole('button', { name: 'Tengo un código' }).click()
    await beto.getByLabel('Tu nombre').fill('Beto')
    await beto.getByLabel('Código de invitación').fill('ZZZZZZZZZZZZ')
    await beto.getByRole('button', { name: 'Unirme' }).click()
    await beto.getByText(/Código inválido, vencido o ya utilizado/).waitFor({ timeout: 15000 })
    assert(true, 'código equivocado rechazado con mensaje claro')
    await beto.getByLabel('Código de invitación').fill(code.toLowerCase())
    await beto.getByRole('button', { name: 'Unirme' }).click()
    await beto.getByText('Hola, Beto').waitFor({ timeout: 30000 })
    assert(true, 'Beto entra al hogar')
    await ana.getByText('El hogar está completo (2 de 2)').waitFor({ timeout: 15000 })
    assert(true, 'Ana ve en tiempo real que el hogar quedó completo')

    step('Gastos fijos: se anotan solos y los ve la pareja')
    await tab(ana, 'Plata')
    await ana.getByRole('button', { name: 'Fijos' }).click()
    await ana.getByRole('button', { name: 'Agregar gasto fijo' }).click()
    await ana.getByLabel('Nombre').fill('Arriendo')
    await ana.getByLabel('Monto mensual').fill('450000')
    const today = sql(`select extract(day from now() at time zone 'America/Santiago')::int`)
    await ana.getByLabel('Día del mes').fill(today)
    await ana.getByRole('button', { name: 'Guardar gasto fijo' }).click()
    await ana.getByText('Total mensual').waitFor({ timeout: 15000 })
    assert(await waitSql(`select count(*) from public.expenses e join public.recurring_expenses r on r.id = e.recurring_id where r.note = 'Arriendo' and e.household_id = (select m.household_id from public.members m join auth.users u on u.id = m.user_id where u.email = '${mail('ana')}') and e.spent_on = (now() at time zone 'America/Santiago')::date`, '1'), 'el arriendo de hoy quedó anotado solo')
    await tab(beto, 'Gastos')
    await beto.getByText('Arriendo').first().waitFor({ timeout: 15000 })
    assert(await beto.getByText(/· fijo/).first().isVisible(), 'Beto lo ve marcado como fijo, en tiempo real')
    await ana.reload()
    await ana.getByText('Hola, Ana').waitFor({ timeout: 30000 })
    assert(sql(`select count(*) from public.expenses e join public.members m on m.household_id = e.household_id join auth.users u on u.id = m.user_id where e.note = 'Arriendo' and u.email = '${mail('ana')}'`) === '1', 'abrir la app de nuevo no lo duplica')

    step('Ingresos extra: privados')
    await tab(ana, 'Plata')
    await ana.getByLabel('Sueldo líquido (lo que te llega al banco)').fill('1000000')
    await ana.getByRole('button', { name: 'Guardar', exact: true }).click()
    await ana.getByRole('button', { name: 'Agregar ingreso' }).click()
    await ana.getByLabel('¿De dónde viene?').fill('Bono-secreto')
    await ana.getByLabel('Monto').fill('200000')
    await ana.getByRole('button', { name: 'Guardar ingreso' }).click()
    await ana.getByText('Ingresos (sueldo + extras)').waitFor({ timeout: 15000 })
    assert(await ana.getByText('$1.200.000').first().isVisible(), 'el bono se suma al sueldo: $1.200.000')
    await tab(beto, 'Plata')
    await beto.getByText('Otros ingresos de').waitFor({ timeout: 15000 })
    assert((await beto.getByText('Bono-secreto').count()) === 0, 'Beto no ve el ingreso de Ana')

    step('Otra pareja (Carla) no ve nada del hogar de Ana y Beto')
    const carla = await newPage(browser, 'carla')
    await register(carla, mail('carla'))
    await createHousehold(carla, 'Carla')
    const seen = await carla.evaluate(async () => {
      const { supabase } = await import('/src/lib/supabase.ts')
      const t = ['expenses', 'recurring_expenses', 'incomes', 'salaries', 'members', 'households', 'debts']
      const r = await Promise.all(t.map((x) => supabase.from(x).select('*')))
      return Object.fromEntries(t.map((x, i) => [x, r[i].data?.length ?? -1]))
    })
    assert(seen.expenses === 0 && seen.recurring_expenses === 0 && seen.incomes === 0 && seen.salaries === 0, `API directa: nada ajeno ${JSON.stringify(seen)}`)
    assert(seen.members === 1 && seen.households === 1, 'Carla solo ve su hogar y a sí misma')
    const anaHid = sql(`select m.household_id from public.members m join auth.users u on u.id = m.user_id where u.email = '${mail('ana')}'`)
    const anaUid = sql(`select id from auth.users where email = '${mail('ana')}'`)
    const listen = (topic) =>
      carla.evaluate(async (topic) => {
        const { supabase } = await import('/src/lib/supabase.ts')
        await supabase.realtime.setAuth()
        return new Promise((r) => {
          const ch = supabase.channel(topic, { config: { private: true } })
          ch.subscribe((st) => {
            if (st !== 'CLOSED') {
              r(st)
              void supabase.removeChannel(ch)
            }
          })
          setTimeout(() => r('TIMEOUT'), 10000)
        })
      }, topic)
    assert((await listen('hh:' + anaHid)) !== 'SUBSCRIBED', 'no puede escuchar el canal del hogar de Ana')
    assert((await listen('u:' + anaUid)) !== 'SUBSCRIBED', 'no puede escuchar el canal privado de Ana')
    assert(sql(`select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'`) === '0', 'ninguna tabla expuesta por postgres_changes')

    step('Beto anota un gasto y sale del hogar')
    await addExpense(beto, ['7', '7', '7'], 'pan-de-beto')
    await tab(beto, 'Ajustes')
    await beto.getByRole('button', { name: 'Salir de este hogar' }).click()
    await beto.getByLabel('Escribe tu contraseña para confirmar').fill('mala-clave-123')
    await beto.getByRole('button', { name: 'Salir del hogar' }).click()
    await beto.getByText('Contraseña incorrecta').waitFor({ timeout: 15000 })
    assert(true, 'pide la contraseña correcta')
    await beto.getByLabel('Escribe tu contraseña para confirmar').fill(PW)
    await beto.getByRole('button', { name: 'Salir del hogar' }).click()
    await beto.getByText('Armemos tu hogar').waitFor({ timeout: 30000 })
    assert(true, 'Beto queda sin hogar')
    await tab(ana, 'Ajustes')
    await ana.getByRole('button', { name: 'Generar código de invitación' }).waitFor({ timeout: 15000 })
    assert(true, 'Ana ve en tiempo real que quedó sola y puede invitar a otra persona')
    await tab(ana, 'Gastos')
    await ana.getByText('pan-de-beto').first().waitFor({ timeout: 15000 }).catch(async (e) => {
      await ana.screenshot({ path: '/tmp/claude-1000/-home-jromero-proyectos/f25a76ea-0cf8-47dc-aa44-617bfde06a98/scratchpad/ana-gastos.png', fullPage: true })
      throw e
    })
    assert(true, 'el gasto de Beto queda en el historial de Ana')
    const betoUid = sql(`select id from auth.users where email = '${mail('beto')}'`)
    assert(sql(`select count(*) from public.salaries where user_id = '${betoUid}'`) === '0', 'no quedan datos privados de Beto')

    step('Beto borra su cuenta')
    await beto.getByRole('button', { name: 'Borrar mi cuenta' }).click()
    await beto.getByLabel('Escribe tu contraseña para confirmar').fill(PW)
    await beto.getByRole('button', { name: 'Borrar mi cuenta para siempre' }).click()
    await beto.getByRole('button', { name: 'Entrar' }).waitFor({ timeout: 30000 })
    assert(sql(`select count(*) from auth.users where email = '${mail('beto')}'`) === '0', 'la cuenta de Beto ya no existe')
    await login(beto, mail('beto'))
    await beto.getByText('Correo o contraseña incorrectos').waitFor({ timeout: 15000 })
    assert(true, 'Beto ya no puede entrar')
    await ana.reload()
    await ana.getByText('Hola, Ana').waitFor({ timeout: 30000 })
    await tab(ana, 'Gastos')
    await ana.getByText('pan-de-beto').first().waitFor({ timeout: 15000 })
    assert(true, 'el historial de Ana sigue intacto')

    step('Ana (sola) borra su cuenta: se va el hogar completo')
    await tab(ana, 'Ajustes')
    await ana.getByRole('button', { name: 'Borrar mi cuenta' }).click()
    await ana.getByLabel('Escribe tu contraseña para confirmar').fill(PW)
    await ana.getByRole('button', { name: 'Borrar mi cuenta para siempre' }).click()
    await ana.getByRole('button', { name: 'Entrar' }).waitFor({ timeout: 30000 })
    assert(sql(`select count(*) from public.households where id = '${anaHid}'`) === '0', 'el hogar de Ana ya no existe')
    assert(sql(`select count(*) from public.members m join auth.users u on u.id = m.user_id where u.email = '${mail('carla')}'`) === '1', 'el hogar de Carla sigue intacto')

    console.log('\nTODO OK')
  } finally {
    await browser.close()
  }
})().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
