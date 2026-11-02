// Requiere el Supabase local (supabase start), el servidor de desarrollo y la llave secreta LOCAL en el entorno:
//   SUPABASE_LOCAL_SECRET_KEY=$(npx supabase status -o env | sed -n 's/^SECRET_KEY="\(.*\)"/\1/p') node e2e/mfa.cjs
const { chromium } = require('playwright-core')
const { createClient } = require('@supabase/supabase-js')
const BASE='http://localhost:5173', URL='http://127.0.0.1:54321', SECRET = process.env.SUPABASE_LOCAL_SECRET_KEY
const email=`g-${Date.now()}@test.cl`, TMP='Temporal-Clave-2026!', NEW='Mi-Clave-Nueva-2026!'
const ok=(c,m)=>{ if(!c) throw new Error('FALLÓ: '+m); console.log('  ✓',m) }
;(async()=>{
  const admin=createClient(URL,SECRET)
  await admin.auth.admin.createUser({email,password:TMP,email_confirm:true,app_metadata:{provider:'google',providers:['google']},user_metadata:{full_name:'María Pérez',accepted_terms_at:new Date().toISOString()}})
  const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true})
  const ctx=await b.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage()
  await p.goto(BASE); await p.fill('#email',email); await p.fill('#password',TMP); await p.getByRole('button',{name:'Entrar',exact:true}).click()
  await p.waitForSelector('text=Paso 1 de 2'); ok(true,'usuario Google sin contraseña ve el paso 1')
  ok(await p.locator('text=Hola, María').count()===1,'saluda por el nombre de Google')
  await p.fill('#sp-pw','aaaaaaaaaa'); await p.fill('#sp-again','aaaaaaaaaa'); await p.getByRole('button',{name:'Continuar'}).click()
  await p.waitForSelector('text=al menos 10'); ok(true,'rechaza contraseña débil')
  await p.fill('#sp-pw',NEW); await p.fill('#sp-again',NEW+'x'); await p.waitForSelector('text=No coinciden'); await p.getByRole('button',{name:'Continuar'}).click()
  await p.waitForSelector('text=no coinciden'); ok(true,'rechaza si no coinciden')
  await p.fill('#sp-again',NEW); await p.getByRole('button',{name:'Continuar'}).click()
  await p.waitForSelector('text=Paso 2 de 2'); ok(true,'pasa al paso 2 (hogar)')
  ok(await p.inputValue('#name')==='María Pérez','nombre sugerido desde Google')
  await b.close(); console.log('TODO OK')
})().catch(e=>{console.error(e.message);process.exit(1)})
