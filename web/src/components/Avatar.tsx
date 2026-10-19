import { memberColor } from '../lib/ui'

interface Props {
  name?: string
  color?: string
  size?: number
}

/** Inicial de la persona, en su color. Reemplaza a los puntitos de colores. */
export default function Avatar({ name, color, size = 32 }: Props) {
  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?'
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.44), background: memberColor({ color: color ?? 'blue' }) }}
      aria-hidden="true"
    >
      {initial}
    </span>
  )
}

/** Dos avatares que se solapan, como la marca. */
export function AvatarPair({ people }: { people: { display_name: string; color: string }[] }) {
  return (
    <span className="avatar-pair" aria-hidden="true">
      {people.slice(0, 2).map((m, i) => (
        <Avatar key={i} name={m.display_name} color={m.color} size={34} />
      ))}
    </span>
  )
}
