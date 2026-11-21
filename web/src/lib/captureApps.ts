// Copyright (c) 2026 Dinovance
// Lista blanca de apps que pueden mandar avisos (el modo aprender lo entrega el plugin: readRecentApps).

const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/
const MAX_PACKAGE = 200

export const isPackageName = (s: string): boolean => s.length <= MAX_PACKAGE && PACKAGE.test(s)

export function togglePackage(list: readonly string[], pkg: string): string[] {
  return list.includes(pkg) ? list.filter((p) => p !== pkg) : [...list, pkg]
}

/** Lo que se le entrega al teléfono: con la captura apagada, nada. */
export function effectivePackages(c: { enabled: boolean; savedPackages: readonly string[] }): string[] {
  return c.enabled ? [...c.savedPackages] : []
}
