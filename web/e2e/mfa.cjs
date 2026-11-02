// Requiere el Supabase local (supabase start), el servidor de desarrollo y la llave secreta LOCAL en el entorno:
//   SUPABASE_LOCAL_SECRET_KEY=$(npx supabase status -o env | sed -n 's/^SECRET_KEY="\(.*\)"/\1/p') node e2e/mfa.cjs
const { chromium } = require('playwright-core')
const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')
const BASE = 'http://localhost:5173', URL = 'http://127.0.0.1:54321'
const SECRET = process.env.SUPABASE_LOCAL_SECRET_KEY
const PW = 'Clave-Segura-2026!', email = `mfa-${Date.now()}@test.cl`
const b32 = (s) => { const A='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits='',out=''; for (const c of s.replace(/=+$/,'')) bits+=A.indexOf(c).toString(2).padStart(5,'0'); for (let i=0;i+8<=bits.length;i+=8) out+=String.fromCharCode(parseInt(bits.slice(i,i+8),2)); return Buffer.from(out,'latin1') }
const totp = (secret) => { const c=Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000))); const h=crypto.createHmac('sha1',b32(secret)).update(c).digest(); const o=h[19]&15; return String(((h.readUInt32BE(o)&0x7fffffff)%1e6)).padStart(6,'0') }
const ok=(c,m)=>{ if(!c) throw new Error('FALLÓ: '+m); console.log('  ✓',m) }
;(async () => {
  const admin = createClient(URL, SECRET)
  await admin.auth.admin.createUser({ email, password: PW, email_confirm: true, user_metadata: { accepted_terms_at: new Date().toISOString() } })
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true })
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  await ctx.addInitScript(() => { const g = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { return /^nido-(tour-v1|news-[^:]*):/.test(String(k)) ? '1' : g.call(this, k) } })
  const p = await ctx.newPage(); p.on('pageerror', e => console.log('pageerror', e.message))
  const login = async () => { await p.goto(BASE); await p.fill('#email', email); await p.fill('#password', PW); await p.getByRole('button', { name: 'Entrar', exact: true }).click() }
  // 1) sin MFA entra directo (onboarding)
  await login(); await p.waitForSelector('text=Armemos tu hogar'); ok(true, 'sin 2FA entra directo al onboarding')
  await p.fill('#name', 'Ana'); await p.getByRole('button', { name: 'Crear hogar', exact: true }).last().click()
  await p.waitForSelector('nav.tabbar'); ok(true, 'hogar creado')
  // 2) activar 2FA desde Ajustes
  await p.getByRole('button', { name: /ajustes/i }).first().click().catch(()=>{})
  await p.waitForTimeout(500)
  await p.getByText('Verificación en dos pasos').first().click()
  await p.getByRole('button', { name: 'Activar la verificación' }).click()
  await p.waitForSelector('text=escribe esta clave')
  const txt = await p.locator('.line-help', { hasText: 'escribe esta clave' }).innerText()
  const secret = txt.split('clave:')[1].trim()
  await p.fill('#mfa-card-code', totp(secret)); await p.getByRole('button', { name: 'Confirmar y activar' }).click()
  await p.waitForSelector('text=Activada'); ok(true, '2FA activada desde Ajustes')
  // 3) nueva sesión: pide el código
  await ctx.clearCookies(); await p.evaluate(() => localStorage.clear()); 
  await login(); await p.waitForSelector('text=Escribe el código de 6 números')
  ok(true, 'al entrar con 2FA se pide el código antes de ver la app')
  ok(await p.locator('nav.tabbar').count() === 0, 'la app no se ve sin el código')
  await p.fill('#mfa-login-code', '000000'); await p.getByRole('button', { name: 'Entrar', exact: true }).click()
  await p.waitForSelector('text=no es correcto'); ok(true, 'código malo rechazado')
  await p.fill('#mfa-login-code', totp(secret)); await p.getByRole('button', { name: 'Entrar', exact: true }).click()
  await p.waitForSelector('nav.tabbar', { timeout: 8000 }); ok(true, 'código bueno: entra a la app')
  await b.close()
  console.log('TODO OK')
})().catch(e => { console.error(e.message); process.exit(1) })
