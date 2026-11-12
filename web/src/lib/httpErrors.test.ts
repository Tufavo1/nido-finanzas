import { describe, expect, it } from 'vitest'
import { errorInfo, errorPageHtml, wantsHtml } from './httpErrors'

describe('errorInfo: qué se le dice a la persona en cada error', () => {
  it('403: sin permiso, y reintentar no sirve', () => {
    expect(errorInfo(403)).toMatchObject({ status: 403, code: '403', title: 'No tienes permiso para ver esto', retry: false })
  })
  it('404: la página no existe', () => {
    expect(errorInfo(404)).toMatchObject({ code: '404', title: 'No encontramos esta página', retry: false })
  })
  it('401: la sesión venció', () => {
    expect(errorInfo(401)).toMatchObject({ title: 'Tu sesión venció', retry: false })
  })
  it('429: demasiados intentos, se puede reintentar después', () => {
    expect(errorInfo(429)).toMatchObject({ title: 'Demasiados intentos', retry: true })
  })
  it('502, 503 y 504: falla pasajera del servicio, con botón de reintentar y la calma de que los datos están a salvo', () => {
    expect(errorInfo(502).title).toBe('El servicio no responde')
    expect(errorInfo(503).title).toBe('Estamos en mantención')
    expect(errorInfo(504).title).toBe('Está tardando demasiado')
    for (const s of [500, 502, 503, 504]) {
      expect(errorInfo(s).retry, String(s)).toBe(true)
      expect(errorInfo(s).detail, String(s)).toContain('Tus datos están a salvo')
    }
  })
  it('0: sin conexión, no muestra un número', () => {
    expect(errorInfo(0)).toMatchObject({ code: '', title: 'Sin conexión', retry: true })
  })
  it('un código desconocido cae en el mensaje de su familia', () => {
    expect(errorInfo(418).title).toBe(errorInfo(400).title)
    expect(errorInfo(599).title).toBe(errorInfo(500).title)
    expect(errorInfo(418).code).toBe('418')
  })
  it('ningún texto usa palabras técnicas', () => {
    for (const s of [0, 400, 401, 403, 404, 405, 408, 413, 415, 429, 500, 502, 503, 504]) {
      const { title, detail } = errorInfo(s)
      expect(`${title} ${detail}`, String(s)).not.toMatch(/proxy|gateway|servidor upstream|supabase|token|request|HTTP/i)
    }
  })
})

describe('errorPageHtml: la página que ve quien abre una dirección con error', () => {
  it('es una página completa en español con el código, el título y la salida al inicio', () => {
    const html = errorPageHtml(403)
    expect(html).toMatch(/^<!doctype html>/i)
    expect(html).toContain('<html lang="es">')
    expect(html).toContain('403')
    expect(html).toContain('No tienes permiso para ver esto')
    expect(html).toContain('href="/"')
    expect(html).toContain('<meta name="robots" content="noindex">')
  })
  it('ofrece reintentar solo cuando sirve', () => {
    expect(errorPageHtml(502)).toContain('Reintentar')
    expect(errorPageHtml(403)).not.toContain('Reintentar')
  })
  it('no carga nada externo ni ejecuta código', () => {
    const html = errorPageHtml(502)
    expect(html).not.toMatch(/<script|https?:\/\/|onclick=/i)
  })
})

describe('wantsHtml', () => {
  it('una navegación del navegador pide una página', () => {
    expect(wantsHtml('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')).toBe(true)
  })
  it('la app pide datos', () => {
    expect(wantsHtml('application/json')).toBe(false)
    expect(wantsHtml('*/*')).toBe(false)
    expect(wantsHtml(null)).toBe(false)
  })
})
