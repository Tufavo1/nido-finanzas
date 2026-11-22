import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import BankCard from './BankCard'
import PartnerAlerts from './PartnerAlerts'
import SyncStatus from './SyncStatus'

const noop = () => undefined
const bank = { id: 'santander', name: 'Santander', packageName: null, autoSave: false }
const props = { cap: 50_000, busy: false, onToggle: noop, onAssociate: noop, onDissociate: noop }

describe('BankCard', () => {
  it('sin app asociada: lo dice, el interruptor no se puede encender y explica qué hace', () => {
    const html = renderToStaticMarkup(<BankCard bank={bank} {...props} />)
    expect(html).toContain('Guardar solos: Santander')
    expect(html).toContain('Sin app asociada')
    expect(html).toContain('disabled')
    expect(html).toContain('Nunca abonos')
    expect(html).toContain('deshacer')
    expect(html).toContain('50.000')
    expect(html).toContain('aria-checked="false"')
  })
  it('con app asociada: muestra cuál y permite quitarla', () => {
    const html = renderToStaticMarkup(<BankCard bank={{ ...bank, packageName: 'cl.santander.app' }} {...props} />)
    expect(html).toContain('App asociada: cl.santander.app')
    expect(html).toContain('Quitar')
    expect(html).toContain('Cambiar app')
  })
})

describe('SyncStatus', () => {
  it('sin datos todavía: skeleton', () => {
    expect(renderToStaticMarkup(<SyncStatus state={null} onSend={noop} />)).toContain('aria-busy="true"')
  })
  it('con gastos por enviar ofrece Enviar ahora; con error se anuncia como alerta', () => {
    expect(renderToStaticMarkup(<SyncStatus state={{ state: 'idle', lastSyncAt: null, pending: 2 }} onSend={noop} />)).toContain('Enviar ahora')
    expect(renderToStaticMarkup(<SyncStatus state={{ state: 'error', lastSyncAt: null, pending: 1 }} onSend={noop} />)).toContain('role="alert"')
  })
  it('todo al día: sin botón', () => {
    const html = renderToStaticMarkup(<SyncStatus state={{ state: 'idle', lastSyncAt: null, pending: 0 }} onSend={noop} />)
    expect(html).toContain('Todo al día')
    expect(html).not.toContain('Enviar ahora')
  })
})

describe('PartnerAlerts', () => {
  it('al abrir muestra un skeleton mientras lee la preferencia', () => {
    expect(renderToStaticMarkup(<PartnerAlerts onToast={noop} />)).toContain('aria-busy="true"')
  })
})
