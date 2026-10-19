import { captchaToken } from './captcha'
import { supabase } from './supabase'

/** Vuelve a pedir la contraseña antes de algo delicado: una sesión robada no basta */
export async function confirmPassword(password: string): Promise<void> {
  const { data } = await supabase.auth.getUser()
  const email = data.user?.email
  if (!email) throw new Error('No se pudo verificar tu cuenta. Vuelve a iniciar sesión.')
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken: await captchaToken() },
  })
  if (error) throw new Error('Contraseña incorrecta')
}
