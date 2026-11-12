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
  // La guía de bienvenida taparía la app en cada sesión nueva: aquí se da por vista (su propio recorrido se prueba aparte)
  await ctx.addInitScript(() => {
    const get = Storage.prototype.getItem
    Storage.prototype.getItem = function (k) {
      return /^nido-(tour-v1|news-[^:]*):/.test(String(k)) ? '1' : get.call(this, k)
    }
  })
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
  await page.getByRole('checkbox').check()
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
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
}

async function createHousehold(page, name) {
  await page.getByLabel('Tu nombre').fill(name)
  await page.getByRole('button', { name: 'Crear hogar' }).last().click()
  await page.getByText(`Hola, ${name}`).waitFor({ timeout: 30000 })
}

// Ajustes ya no es una pestaña: se abre con el engranaje de Inicio
// section: título del apartado que se despliega dentro de Ajustes
const tab = async (page, name, section) => {
  if (name === 'Ajustes') {
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('button', { name: 'Inicio' }).click()
    await page.getByRole('button', { name: 'Ajustes y seguridad' }).click()
    if (section) await page.locator('.set-head button', { hasText: section }).click()
    return
  }
  return page.getByRole('navigation', { name: 'Principal' }).getByRole('button', { name }).click()
}

async function addExpense(page, digits, note) {
  await tab(page, 'Registrar')
  for (const d of digits) await page.getByRole('button', { name: d, exact: true }).click()
  await page.getByLabel('¿De qué fue?').fill(note)
  await page.locator('.reg-catrow .chip').first().click()
  await page.getByRole('button', { name: /^Guardar \$/ }).click()
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
    await ana.getByText('Instala Contigo en tu celular').waitFor({ timeout: 10000 })
    assert(true, 'aparece el aviso para instalar')
    await ana.getByRole('button', { name: 'Ahora no' }).click()
    await ana.getByText(/cuando quieras desde Ajustes/).waitFor({ timeout: 5000 })
    assert((await ana.getByText('Instala Contigo en tu celular').count()) === 0, 'con "Ahora no" el aviso se cierra y avisa dónde instalar')
    await ana.reload()
    await ana.getByText('Hola, Ana').waitFor({ timeout: 30000 })
    await fakeInstall(ana, 'accepted')
    await ana.waitForTimeout(500)
    assert((await ana.getByText('Instala Contigo en tu celular').count()) === 0, 'tras decir que no, no vuelve a molestar')
    // Ana no es administradora: no ve «Instalación y conexión», y en Notificaciones solo hay los dos interruptores
    await tab(ana, 'Ajustes', 'Notificaciones')
    await ana.getByRole('switch', { name: 'Avisos de tu pareja' }).waitFor()
    await ana.getByRole('switch', { name: 'Avisos de la app' }).waitFor()
    assert((await ana.locator('.set-head button', { hasText: 'Instalación y conexión' }).count()) === 0, 'una persona normal no ve «Instalación y conexión»')
    assert((await ana.locator('.set-head button', { hasText: 'Seguridad de Contigo' }).count()) === 0, 'una persona normal no ve «Seguridad de Contigo»')
    assert((await ana.getByRole('button', { name: 'Enviar prueba' }).count()) === 0, 'una persona normal no ve «Enviar prueba»')
    step('Acerca de: versión, copyright y agradecimiento')
    await ana.locator('.set-head button', { hasText: 'Acerca de Contigo' }).click()
    await ana.getByRole('region', { name: 'Acerca de esta app' }).scrollIntoViewIfNeeded()
    const about = ana.getByRole('region', { name: 'Acerca de esta app' })
    assert(await about.getByText(/^\d+\.\d+\.\d+$/).isVisible(), 'muestra la versión')
    assert(await about.getByText(/© 2026(–\d{4})? Dinovance\. Todos los derechos reservados\./).isVisible(), 'muestra el copyright de Dinovance')
    assert(await about.getByText('Gracias por usar Contigo.').isVisible(), 'da las gracias')
    await about.getByRole('button', { name: 'Buscar actualizaciones' }).click()
    // El resultado sale como aviso, igual que el resto de las acciones
    await ana.locator('.toast').waitFor({ timeout: 10000 })
    assert(true, 'el botón de actualizaciones responde con un aviso')
    const iphone = await newPage(browser, 'iphone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
    await login(iphone, mail('ana'))
    await iphone.getByRole('button', { name: 'Instalar ahora' }).click()
    await iphone.getByText('Añadir a pantalla de inicio').first().waitFor({ timeout: 30000 })
    assert(await iphone.getByRole('button', { name: 'Entendido' }).isVisible(), 'en iPhone explica cómo instalar a mano')
    const login0 = await newPage(browser, 'visita')
    await login0.goto(BASE)
    await login0.getByText('¿Qué necesito para usar Contigo?').click()
    assert(await login0.getByText(/No usamos publicidad ni te seguimos/).isVisible(), 'la pantalla de entrada explica qué se necesita')

    step('Beto se une con el código de invitación')
    await tab(ana, 'Ajustes', 'Mi perfil, hogar y privacidad')
    await ana.locator('.set-head button', { hasText: 'Mi hogar' }).click()
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
    await tab(ana, 'Registrar')
    await ana.getByRole('button', { name: /Registrar un gasto fijo/i }).click()
    await ana.getByLabel('¿Qué pagas?').selectOption('__otro')
    await ana.getByLabel('¿Cómo se llama?').fill('Arriendo')
    await ana.getByLabel('Monto al mes (CLP)').fill('450000')
    const today = sql(`select extract(day from now() at time zone 'America/Santiago')::int`)
    await ana.getByLabel('¿Qué día del mes se paga?').selectOption(today)
    await ana.getByRole('button', { name: 'Guardar gasto fijo' }).click()
    await ana.getByText('Hola, Ana').waitFor({ timeout: 15000 })
    await tab(ana, 'Finanzas')
    await ana.getByRole('tab', { name: 'Fijos' }).click()
    await ana.getByRole('button', { name: /^Arriendo, .* al mes/ }).waitFor({ timeout: 15000 })
    assert(true, 'el gasto fijo aparece como tarjeta que se toca para ver el detalle')
    assert(await waitSql(`select count(*) from public.expenses e join public.recurring_expenses r on r.id = e.recurring_id where r.note = 'Arriendo' and e.household_id = (select m.household_id from public.members m join auth.users u on u.id = m.user_id where u.email = '${mail('ana')}') and e.spent_on = (now() at time zone 'America/Santiago')::date`, '1'), 'el arriendo de hoy quedó anotado solo')
    await tab(beto, 'Gastos')
    await beto.getByText('Arriendo').first().waitFor({ timeout: 15000 })
    assert(await beto.locator('.tag', { hasText: 'Gasto fijo' }).first().isVisible(), 'Beto lo ve marcado como «Gasto fijo» en el historial, en tiempo real')
    await ana.reload()
    await ana.getByText('Hola, Ana').waitFor({ timeout: 30000 })
    assert(sql(`select count(*) from public.expenses e join public.members m on m.household_id = e.household_id join auth.users u on u.id = m.user_id where e.note = 'Arriendo' and u.email = '${mail('ana')}'`) === '1', 'abrir la app de nuevo no lo duplica')

    step('Registrar: la nota es obligatoria, la fecha opcional y se puede cancelar')
    await tab(ana, 'Registrar')
    assert(await ana.getByRole('button', { name: 'Escribe el monto' }).isDisabled(), 'sin monto no se puede guardar')
    for (const d of ['3', '5', '0', '0', '0']) await ana.getByRole('button', { name: d, exact: true }).click()
    assert(await ana.getByRole('button', { name: 'Cuenta de qué es el gasto' }).isDisabled(), 'con monto pero sin nota, no se puede guardar')
    await ana.getByLabel('¿De qué fue?').fill('   ')
    assert(await ana.getByRole('button', { name: 'Cuenta de qué es el gasto' }).isDisabled(), 'una nota de solo espacios tampoco vale')
    await ana.getByRole('button', { name: 'Más opciones' }).click()
    assert((await ana.getByLabel('Fecha del gasto').inputValue()) === '', 'la fecha es opcional: parte vacía')
    await ana.getByLabel('¿De qué fue?').fill('Prueba-cancelada')
    assert(await ana.getByRole('button', { name: 'Elige la categoría' }).isDisabled(), 'un gasto que la app no reconoce pide elegir la categoría')
    await ana.locator('.reg-catrow .chip').first().click()
    assert(await ana.getByRole('button', { name: /^Guardar \$/ }).isEnabled(), 'con nota y sin fecha ya se puede guardar')
    await ana.getByRole('button', { name: 'Limpiar', exact: true }).click()
    assert(await ana.getByRole('button', { name: 'Escribe el monto' }).isDisabled(), '«Limpiar» deja la pantalla como recién abierta')
    assert(sql(`select count(*) from public.expenses e join public.members m on m.household_id = e.household_id join auth.users u on u.id = m.user_id where e.note = 'Prueba-cancelada' and u.email = '${mail('ana')}'`) === '0', 'lo cancelado no se guardó')
    assert((await ana.getByLabel('¿De qué fue?').inputValue()) === '', 'tras limpiar, la nota empieza de cero')
    for (const d of ['1', '2', '0', '0', '0']) await ana.getByRole('button', { name: d, exact: true }).click()
    await ana.getByLabel('¿De qué fue?').fill('Café-sin-fecha')
    await ana.locator('.reg-catrow .chip').first().click()
    await ana.getByRole('button', { name: /^Guardar \$/ }).click()
    await ana.getByText('Hola,').waitFor({ timeout: 15000 })
    assert(await waitSql(`select count(*) from public.expenses e join public.members m on m.household_id = e.household_id join auth.users u on u.id = m.user_id where e.note = 'Café-sin-fecha' and u.email = '${mail('ana')}' and e.spent_on = (now() at time zone 'America/Santiago')::date`, '1'), 'sin fecha, el gasto se anotó con la fecha de hoy')

    step('Inicio: lo importante primero, gráficos plegados al final y sin DinovanceAI')
    await tab(ana, 'Inicio')
    await ana.getByText('Gastado en el mes').waitFor({ timeout: 15000 })
    assert((await ana.getByRole('region', { name: 'DinovanceAI en Inicio' }).count()) === 0, 'Inicio no muestra DinovanceAI (vive en Finanzas → Análisis)')
    assert((await ana.getByRole('button', { name: /Avisos/ }).count()) === 0, 'Inicio no tiene la campana de avisos')
    await ana.getByText('Últimos gastos').first().waitFor({ timeout: 10000 })
    assert((await ana.locator('main .item').count()) <= 3, 'solo 3 gastos en el Inicio')
    const yHist = (await ana.getByText('Últimos gastos').first().boundingBox()).y
    assert((await ana.getByText('Calendario').count()) === 0, 'el calendario y los gráficos empiezan plegados')
    await ana.getByRole('button', { name: 'Ver gráficos' }).click()
    await ana.getByText('Calendario').first().waitFor({ timeout: 10000 })
    const yCal = (await ana.getByText('Calendario').first().boundingBox()).y
    assert(yCal > yHist, 'los gráficos van después de los gastos')
    await ana.getByRole('button', { name: 'Ocultar gráficos' }).click()

    step('Ingresos extra: privados')
    await tab(ana, 'Finanzas')
    await ana.getByRole('tab', { name: 'Sueldo', exact: true }).click()
    await ana.getByText('El sueldo es personal').waitFor({ timeout: 10000 })
    assert(true, 'en la vista Hogar el sueldo no se muestra: es personal')
    await ana.getByRole('button', { name: 'Ver mi sueldo' }).click()
    await ana.getByRole('button', { name: 'Agregar mi sueldo' }).click()
    await ana.getByLabel('Sueldo líquido mensual').fill('1000000')
    await ana.getByRole('button', { name: 'Guardar mi sueldo' }).click()
    await ana.getByRole('button', { name: /^Tu sueldo, .*1\.000\.000/ }).waitFor({ timeout: 15000 })
    assert(true, 'el sueldo queda como tarjeta con su monto')
    await ana.getByRole('button', { name: 'Agregar ingreso extra' }).click()
    await ana.getByLabel('¿De dónde viene?').fill('Bono-secreto')
    await ana.getByLabel('Monto', { exact: true }).fill('200000')
    await ana.getByRole('button', { name: 'Guardar ingreso' }).click()
    await ana.getByRole('button', { name: /^Bono-secreto, .*200\.000/ }).waitFor({ timeout: 15000 })
    assert(true, 'el ingreso extra queda en su historial, con «Toca para ver el detalle»')
    await tab(beto, 'Finanzas')
    await beto.getByRole('tab', { name: 'Sueldo', exact: true }).click()
    await beto.getByRole('button', { name: 'Ver mi sueldo' }).click()
    await beto.getByText(/Ingresos extra de/).waitFor({ timeout: 15000 })
    assert((await beto.getByText('Bono-secreto').count()) === 0, 'Beto no ve el ingreso de Ana')

    step('Análisis personal: cada uno ve solo lo suyo')
    await ana.getByRole('tab', { name: 'Análisis' }).click()
    await ana.getByText('Tu panorama').waitFor({ timeout: 20000 })
    for (const t of ['En qué se va tu plata', 'Este mes en números', 'Tu salud financiera']) {
      await ana.getByText(t, { exact: true }).first().waitFor({ timeout: 10000 })
      assert(true, `Ana ve «${t}»`)
    }
    assert(await ana.getByRole('button', { name: /Este mes en números/ }).getByText('$1.200.000').isVisible(), 'sueldo + bono suman $1.200.000 en «Este mes en números»')
    assert((await ana.locator('.legend-item', { hasText: 'Supermercado' }).count()) === 1, 'el anillo muestra la categoría de su gasto fijo con su monto')
    await tab(beto, 'Finanzas')
    await beto.getByRole('tab', { name: 'Análisis' }).click()
    await beto.getByText('Tu panorama').waitFor({ timeout: 20000 })
    assert(await beto.getByRole('button', { name: 'Poner mi sueldo' }).isVisible(), 'Beto (sin sueldo) ve el aviso para ponerlo y ningún puntaje')
    assert((await beto.getByRole('button', { name: /Tu salud financiera/ }).count()) === 0, 'el sueldo de Ana no se filtra al análisis de Beto')

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
    await tab(beto, 'Ajustes', 'Salir del hogar o borrar la cuenta')
    await beto.getByRole('button', { name: 'Salir de este hogar' }).click()
    await beto.getByLabel('Escribe tu contraseña para confirmar').fill('mala-clave-123')
    await beto.getByRole('button', { name: 'Salir del hogar', exact: true }).click()
    await beto.getByText('Contraseña incorrecta').waitFor({ timeout: 15000 })
    assert(true, 'pide la contraseña correcta')
    await beto.getByLabel('Escribe tu contraseña para confirmar').fill(PW)
    await beto.getByRole('button', { name: 'Salir del hogar', exact: true }).click()
    await beto.getByText('Armemos tu hogar').waitFor({ timeout: 30000 })
    assert(true, 'Beto queda sin hogar')
    await tab(ana, 'Ajustes', 'Mi perfil, hogar y privacidad')
    await ana.locator('.set-head button', { hasText: 'Mi hogar' }).click()
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
    await beto.getByRole('button', { name: 'Entrar', exact: true }).waitFor({ timeout: 30000 })
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
    await tab(ana, 'Ajustes', 'Salir del hogar o borrar la cuenta')
    await ana.getByRole('button', { name: 'Borrar mi cuenta' }).click()
    await ana.getByLabel('Escribe tu contraseña para confirmar').fill(PW)
    await ana.getByRole('button', { name: 'Borrar mi cuenta para siempre' }).click()
    await ana.getByRole('button', { name: 'Entrar', exact: true }).waitFor({ timeout: 30000 })
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
