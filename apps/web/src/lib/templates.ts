/** Fill a Hebrew message template like "היי {שם}..." with values. */
export function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{([^}]+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}
