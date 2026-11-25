// Copyright (c) 2026 Dinovance
import { describe, expect, it } from 'vitest'
import { friendlyError } from './security'

describe('friendlyError: manda el código, no cualquier palabra del texto', () => {
  it('contraseña débil solo con su código (o el texto de largo mínimo)', () => {
    expect(friendlyError({ code: 'weak_password', message: 'x' })).toMatch(/muy débil/)
    expect(friendlyError('Password should be at least 10 characters')).toMatch(/muy débil/)
  })
  it('un error que solo menciona «password» NO dice que es débil', () => {
    expect(friendlyError({ code: 'same_password', message: 'New password should be different from the old password.' })).toBe('La contraseña nueva debe ser distinta de la actual.')
    expect(friendlyError('Password recovery requires an email')).not.toMatch(/débil/)
    expect(friendlyError('Something about password')).toBe('Algo salió mal. Intenta de nuevo.')
  })
  it('límite de intentos por código y los textos en español del servidor', () => {
    expect(friendlyError({ code: 'over_request_rate_limit' })).toMatch(/Demasiados intentos/)
    expect(friendlyError('Demasiados intentos. Espera una hora e inténtalo de nuevo.')).toMatch(/Demasiados intentos\. Espera un momento/)
    expect(friendlyError('Código inválido o ya utilizado')).toMatch(/Código inválido, vencido/)
    expect(friendlyError('Ya perteneces a un hogar')).toBe('Ya perteneces a un hogar.')
  })
  it('nunca devuelve el texto crudo del servidor', () => {
    expect(friendlyError('relation "public.salaries" does not exist (SQLSTATE 42P01)')).toBe('Algo salió mal. Intenta de nuevo.')
  })
})
