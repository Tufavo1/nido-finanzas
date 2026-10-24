import { useEffect, useState } from 'react'
import { runSecurityChecks } from '../lib/securityChecks'
import type { Check } from '../lib/securityChecks'

interface Point {
  title: string
  text: string
}

const GROUPS: { title: string; points: Point[] }[] = [
  {
    title: 'Tu cuenta',
    points: [
      { title: 'Verificación anti-bots', text: 'Al registrarte, entrar o recuperar la contraseña se usa Cloudflare Turnstile, para frenar los intentos automáticos.' },
      { title: 'Contraseña exigente', text: 'Mínimo 10 caracteres y se rechazan las más obvias. Tu contraseña nunca se guarda en el teléfono.' },
      { title: 'Confirmación en lo delicado', text: 'Cambiar la contraseña, salir del hogar o borrar la cuenta vuelve a pedir tu contraseña actual: una sesión ajena no basta.' },
      { title: 'Sesiones que se renuevan', text: 'La sesión dura una hora y se renueva sola con un token nuevo cada vez. Puedes cerrarla en todos tus otros dispositivos.' },
      { title: 'Avisos por correo', text: 'Si cambia la contraseña o el correo de tu cuenta, te llega un correo para que lo notes enseguida.' },
    ],
  },
  {
    title: 'Tus datos',
    points: [
      { title: 'Cada hogar, aislado', text: 'La base de datos aplica reglas por fila: solo ves lo que pertenece a tu hogar. Esas reglas se prueban con pruebas automáticas.' },
      { title: 'Sueldo e ingresos, solo tuyos', text: 'Tu sueldo, tus ingresos extra y tu perfil no los puede leer nadie más, ni siquiera tu pareja.' },
      { title: 'Invitaciones seguras', text: 'El código tiene 12 caracteres, vence en 7 días y solo permite 10 intentos por hora. Un hogar admite máximo 2 personas, y lo asegura la base de datos.' },
      { title: 'Panel de administración', text: 'Solo muestra conteos agregados, sin montos ni nombres. La autorización se comprueba en el servidor, no en la pantalla.' },
      { title: 'Cifrado en tránsito y en reposo', text: 'Todo viaja por HTTPS y el proveedor de la base de datos cifra los discos donde se guarda.' },
      { title: 'Borrado real', text: 'Si borras tu cuenta o el hogar, los datos se eliminan de la base; no quedan ocultos.' },
    ],
  },
  {
    title: 'Esta aplicación (PWA)',
    points: [
      { title: 'Servidor de datos oculto', text: 'La app solo habla con este mismo sitio. La dirección real del servidor de datos y su clave no están en el código que se descarga: pasan por un proxy que además filtra rutas, rechaza otros orígenes y limita los intentos por persona.' },
      { title: 'Solo código propio', text: 'Una política de seguridad de contenido impide cargar o ejecutar código de otros sitios, salvo el captcha. Eso bloquea gran parte de los ataques por inyección.' },
      { title: 'Sin rastreadores', text: 'No hay analítica ni publicidad de terceros, y el navegador solo puede conectarse a este mismo sitio y al captcha.' },
      { title: 'Protegida contra incrustación', text: 'No puede abrirse dentro de otra página (evita el clickjacking) y exige HTTPS en cada visita (HSTS).' },
      { title: 'Caché sin tus finanzas', text: 'El service worker guarda solo los archivos de la app. Las respuestas con tus datos nunca entran a la caché; abajo lo puedes comprobar en vivo.' },
      { title: 'Permisos mínimos', text: 'La cámara, el micrófono y la ubicación están bloqueados para esta app. Las notificaciones son opcionales.' },
      { title: 'Texto siempre como texto', text: 'Lo que escribes (notas, nombres) se muestra como texto plano, nunca como código. Los archivos CSV que exportas neutralizan fórmulas peligrosas.' },
      { title: 'Bloqueo por inactividad', text: 'Opcional: la app se tapa sola y pide tu contraseña tras el tiempo que elijas.' },
    ],
  },
]

const LIMITS = [
  'No es cifrado de extremo a extremo: los datos están cifrados en tránsito y en reposo, pero el servicio puede leerlos técnicamente para funcionar.',
  'El bloqueo de la app protege de miradas curiosas, no reemplaza el bloqueo de pantalla de tu teléfono.',
  'Si alguien conoce tu contraseña, puede entrar. Usa una larga y que no repitas en otros sitios.',
  'Las copias de seguridad del servidor dependen del plan del proveedor. Descarga tu propio respaldo cada tanto.',
]

const MARK = { true: '✓', false: '!', null: '–' } as const

/** Qué protege de verdad a esta app: comprobaciones en vivo + lo que está diseñado así + los límites, sin adornos */
export default function SecurityInfo() {
  const [checks, setChecks] = useState<Check[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void runSecurityChecks().then((c) => !cancelled && setChecks(c))
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="stack">
      <section className="card">
        <strong>Comprobado ahora mismo en este dispositivo</strong>
        {!checks ? (
          <span className="muted">Revisando…</span>
        ) : (
          <ul className="check-list">
            {checks.map((c) => (
              <li key={c.id} className={`check ${c.ok === null ? 'na' : c.ok ? 'ok' : 'warn'}`}>
                <span className="check-mark" aria-hidden="true">
                  {MARK[String(c.ok) as keyof typeof MARK]}
                </span>
                <span className="grow">
                  <span className="strong">{c.label}</span>
                  <span className="muted small-text">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {GROUPS.map((g) => (
        <section className="card" key={g.title}>
          <strong>{g.title}</strong>
          <ul className="check-list">
            {g.points.map((p) => (
              <li key={p.title} className="check ok">
                <span className="check-mark" aria-hidden="true">
                  ✓
                </span>
                <span className="grow">
                  <span className="strong">{p.title}</span>
                  <span className="muted small-text">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="card">
        <strong>Lo que debes saber</strong>
        <span className="muted small-text">Ninguna app es invulnerable. Esto es lo que no cubre:</span>
        <ul className="check-list">
          {LIMITS.map((l) => (
            <li key={l} className="check warn">
              <span className="check-mark" aria-hidden="true">
                !
              </span>
              <span className="grow muted small-text">{l}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
