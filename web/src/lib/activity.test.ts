import { describe, expect, it } from 'vitest'
import { authLabel, beginRead, beginWait, beginWrite, getActivity, loaderText } from './activity'

describe('activity', () => {
  it('cuenta las escrituras en curso y recuerda el método más reciente', () => {
    const a = beginWrite('patch')
    expect(getActivity().writes).toBe(1)
    const b = beginWrite('DELETE')
    expect(getActivity().writes).toBe(2)
    expect(getActivity().method).toBe('DELETE')
    b()
    expect(getActivity().method).toBe('PATCH')
    a()
    expect(getActivity().writes).toBe(0)
  })

  it('terminar dos veces la misma escritura no descuenta de más', () => {
    const a = beginWrite('POST')
    const b = beginWrite('POST')
    a()
    a()
    expect(getActivity().writes).toBe(1)
    b()
    expect(getActivity().writes).toBe(0)
  })

  it('lecturas y esperas de conexión tienen su propio conteo', () => {
    const r = beginRead()
    const w = beginWait()
    expect(getActivity().reads).toBe(1)
    expect(getActivity().waiting).toBe(1)
    r()
    r()
    w()
    w()
    expect(getActivity().reads).toBe(0)
    expect(getActivity().waiting).toBe(0)
  })
})

describe('loaderText', () => {
  it('dice qué se está haciendo según el método', () => {
    expect(loaderText('DELETE', false, false).title).toBe('Eliminando…')
    expect(loaderText('POST', false, false).title).toBe('Guardando…')
    expect(loaderText('PATCH', false, false).title).toBe('Guardando cambios…')
  })

  it('avisa si no hay conexión o si va lento', () => {
    expect(loaderText('PATCH', false, true).title).toBe('Sin conexión')
    expect(loaderText('PATCH', true, false).detail).toContain('tardando más de lo normal')
  })
})

describe('authLabel', () => {
  const base = 'http://localhost/supabase/auth/v1'
  it('titula iniciar sesión, registrarse y cerrar sesión', () => {
    expect(authLabel(`${base}/token?grant_type=password`, 'POST')).toBe('Iniciando sesión…')
    expect(authLabel(`${base}/signup`, 'POST')).toBe('Creando tu cuenta…')
    expect(authLabel(`${base}/logout`, 'POST')).toBe('Cerrando sesión…')
    expect(authLabel(`${base}/recover`, 'POST')).toBe('Enviando el correo…')
  })

  it('no bloquea la pantalla al renovar la sesión ni al leer', () => {
    expect(authLabel(`${base}/token?grant_type=refresh_token`, 'POST')).toBeNull()
    expect(authLabel(`${base}/user`, 'GET')).toBeNull()
  })

  it('el título propio reemplaza al genérico del cargador', () => {
    expect(loaderText('POST', false, false, 'Iniciando sesión…').title).toBe('Iniciando sesión…')
  })
})
