import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import { LEVELS, buildFinancialProfile } from '../lib/financialProfile'
import { levelColor } from '../lib/chartColors'
import { useAnalysisBuild } from '../lib/useAnalysisBuild'
import SectionHead from './SectionHead'

/** Tu perfil financiero: qué tipo de perfil eres hoy según tu análisis, tu nivel y cómo subir */
export default function FinancialProfile({ hh, data, month, onGoSalary }: { hh: Household; data: HouseholdData; month: Date; onGoSalary: () => void }) {
  const { built, failed, retry } = useAnalysisBuild(hh, data, month)

  if (failed) {
    return (
      <section className="card wide">
        <strong>No se pudo calcular tu perfil</strong>
        <span className="muted">Revisa tu conexión e inténtalo de nuevo.</span>
        <button type="button" className="btn small" onClick={retry}>
          Reintentar
        </button>
      </section>
    )
  }
  if (!built) {
    return (
      <section className="card wide">
        <span className="muted" role="status">
          Calculando tu perfil…
        </span>
      </section>
    )
  }

  const result = buildFinancialProfile(built.a, built.n)
  if (!result.ready) {
    return (
      <section className="card wide empty">
        <strong>Aún no podemos armar tu perfil</strong>
        <span className="muted">Para saber qué perfil financiero tienes necesitamos algunos datos:</span>
        <ul className="plain-list">
          {result.missing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <button type="button" className="btn small" onClick={onGoSalary}>
          Poner mi sueldo
        </button>
      </section>
    )
  }
  const p = result.profile

  return (
    <>
      <section className="card hero fin-hero" aria-label="Tu perfil financiero">
        <div className="fin-hero-main">
          <span className="fin-mark" aria-hidden="true">{p.mark}</span>
          <div className="grow">
            <span className="muted small-text">Tu perfil financiero</span>
            <strong className="fin-name">{p.name}</strong>
            <span className="strong">{p.tagline}</span>
          </div>
          <span className="pill">🔒 Solo tú</span>
        </div>
        <p className="fin-desc">{p.description}</p>
        <div className="fin-level">
          <div className="row between">
            <strong>Nivel {p.level} de 5 · {p.levelName}</strong>
            <span className="muted num small-text">{p.score} / 100 puntos</span>
          </div>
          <div className="fin-steps" role="img" aria-label={`Nivel ${p.level} de 5`}>
            {LEVELS.map((name, i) => (
              <span key={name} className={i < p.level ? 'on' : ''} title={name} />
            ))}
          </div>
          <span className="muted small-text">
            {p.toNext === null ? 'Estás en el nivel más alto. Mantén tus hábitos.' : `Te faltan ${p.toNext} puntos para llegar a «${LEVELS[p.level]}».`}
          </span>
        </div>
      </section>

      <SectionHead title="Tus rasgos" hint="Las cuatro áreas que forman tu puntaje" />
      <div className="fin-traits wide">
        {p.traits.map((t) => (
          <div className="card" key={t.key}>
            <div className="row between">
              <strong>{t.label}</strong>
              <span className="num strong">{t.pct} %</span>
            </div>
            <div className="bar big" role="img" aria-label={`${t.label}: ${t.pct} %`}>
              <span style={{ width: `${t.pct}%`, background: levelColor(t.level) }} />
            </div>
            <span className="muted small-text">{t.detail}</span>
          </div>
        ))}
      </div>

      {(p.strengths.length > 0 || p.toImprove.length > 0) && <SectionHead title="Fortalezas y puntos a mejorar" hint="Lo que ya haces bien y dónde está tu oportunidad" />}
      {p.strengths.length > 0 && (
        <section className="card">
          <strong>Lo que haces bien</strong>
          <ul className="plain-list ok">
            {p.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      )}
      {p.toImprove.length > 0 && (
        <section className="card">
          <strong>Dónde puedes mejorar</strong>
          <ul className="plain-list warn">
            {p.toImprove.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      <SectionHead title="Tu camino para subir de nivel" hint="Tres pasos concretos, del más urgente al más largo" />
      <div className="fixed-grid wide">
        {p.steps.map((s, i) => (
          <div className="fixed-card fin-step" key={s.title}>
            <span className="fixed-top">
              <span className="fin-num" aria-hidden="true">{i + 1}</span>
              <span className="grow fixed-name">
                <strong>{s.title}</strong>
              </span>
            </span>
            <span className="muted small-text">{s.detail}</span>
            <span className="fixed-next">
              <span className="pill fixed-when">{s.when}</span>
            </span>
          </div>
        ))}
      </div>

      <section className="card wide fin-motivation">
        <strong>Un empujón para seguir</strong>
        <p>{p.motivation}</p>
        <span className="muted small-text">
          Tu perfil se calcula solo con tus datos y se actualiza cada mes. Son orientaciones, no asesoría financiera.
        </span>
      </section>
    </>
  )
}
