import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SkeletonCard, SkeletonChart, SkeletonList, SkeletonScreen } from './Skeleton'
import StatePage from './StatePage'
import ErrorPage from './ErrorPage'
import EmptyState from './EmptyState'
import NotificationPermission from './NotificationPermission'
import { AlertList, EventTimeline, HealthList, SeverityBadge } from './SecurityPanelParts'
import { errorScreen } from '../lib/screenState'

const noop = () => undefined

describe('skeletons', () => {
  it('avisan al lector de pantalla y marcan lo visual como decorativo', () => {
    for (const html of [renderToStaticMarkup(<SkeletonCard />), renderToStaticMarkup(<SkeletonList />), renderToStaticMarkup(<SkeletonChart />)]) {
      expect(html).toContain('role="status"')
      expect(html).toContain('aria-busy="true"')
      expect(html).toContain('sr-only')
      expect(html).toContain('aria-hidden="true"')
    }
  })
  it('la pantalla completa tiene título, tarjeta, gráfico y lista', () => {
    const html = renderToStaticMarkup(<SkeletonScreen />)
    expect(html).toContain('skel-bars')
    expect(html).toContain('skel-row')
  })
})

describe('StatePage y ErrorPage', () => {
  it('muestra título, detalle y una acción', () => {
    const spec = errorScreen({ kind: 'OFFLINE' })
    const html = renderToStaticMarkup(<StatePage spec={spec} onPrimary={noop} />)
    expect(html).toContain('Sin conexión')
    expect(html).toContain('Reintentar')
    expect(html).toContain('role="status"')
  })
  it('los demás errores se anuncian como alerta', () => {
    expect(renderToStaticMarkup(<StatePage spec={errorScreen({ kind: 'FORBIDDEN' })} onPrimary={noop} />)).toContain('role="alert"')
  })
  it('ErrorPage con un 503 muestra mantenimiento y Reintentar; con un 403 usa la salida dada', () => {
    expect(renderToStaticMarkup(<ErrorPage status={503} onRetry={noop} />)).toContain('mejorando')
    const html = renderToStaticMarkup(<ErrorPage status={403} onExit={noop} exitLabel="Cerrar sesión" />)
    expect(html).toContain('Cerrar sesión')
    expect(html).not.toContain('Reintentar')
  })
})

describe('EmptyState', () => {
  it('con la lista vacía guía el primer paso; con elementos no dibuja nada', () => {
    expect(renderToStaticMarkup(<EmptyState section="expenses" count={0} onCta={noop} />)).toContain('Anotar mi primer gasto')
    expect(renderToStaticMarkup(<EmptyState section="expenses" count={3} onCta={noop} />)).toBe('')
  })
})

describe('NotificationPermission', () => {
  const base = { onOpenSystemSettings: noop, onRequest: noop }
  it('pendiente: ofrece activar desde la app', () => {
    const html = renderToStaticMarkup(<NotificationPermission {...base} permission="default" wasGranted={false} />)
    expect(html).toContain('Activar el acceso')
  })
  it('revocado: avisa como alerta y lleva a los ajustes con pasos', () => {
    const html = renderToStaticMarkup(<NotificationPermission {...base} permission="denied" wasGranted showRestrictedHelp />)
    expect(html).toContain('role="alert"')
    expect(html).toContain('Abrir ajustes')
    expect(html).toContain('ajustes restringidos')
  })
  it('concedido: no muestra nada', () => {
    expect(renderToStaticMarkup(<NotificationPermission {...base} permission="granted" wasGranted />)).toBe('')
  })
})

describe('panel de seguridad: la gravedad se dice con texto', () => {
  it('cada gravedad lleva su palabra, no solo color', () => {
    expect(renderToStaticMarkup(<SeverityBadge severity="critical" />)).toContain('Crítica')
    expect(renderToStaticMarkup(<SeverityBadge severity="low" />)).toContain('Baja')
  })
  it('alertas: la más grave va primero; sin alertas no promete seguridad', () => {
    const html = renderToStaticMarkup(
      <AlertList hoursText="24 horas" alerts={[
        { id: 'a', severity: 'low', kind: 'k', title: 'Aviso leve', detail: '', at: '2026-11-21T10:00:00Z' },
        { id: 'b', severity: 'critical', kind: 'k', title: 'Aviso grave', detail: '', at: '2026-11-21T09:00:00Z' },
      ]} />,
    )
    expect(html.indexOf('Aviso grave')).toBeLessThan(html.indexOf('Aviso leve'))
    expect(renderToStaticMarkup(<AlertList hoursText="24 horas" alerts={[]} />)).toContain('no asegura')
  })
  it('línea de tiempo vacía y estado de salud con texto', () => {
    expect(renderToStaticMarkup(<EventTimeline hoursText="1 hora" events={[]} />)).toContain('No se registraron eventos')
    const html = renderToStaticMarkup(<HealthList health={{ db: 'ok', auth: 'degraded', gateway: 'down', push_queue: 'ok' }} />)
    expect(html).toContain('Con problemas')
    expect(html).toContain('Caído')
  })
})
