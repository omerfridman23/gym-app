/** Convert an Israeli local number (05X-XXXXXXX) to international 972 form. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('00972')) return digits.slice(2)
  if (digits.startsWith('0')) return '972' + digits.slice(1)
  if (digits.startsWith('972')) return digits
  return digits
}

export function isWhatsappPhone(phone: string): boolean {
  return /^9725\d{8}$/.test(normalizePhone(phone))
}

export function waLink(phone: string, text?: string): string {
  const base = `https://wa.me/${normalizePhone(phone)}`
  return text ? `${base}?text=${encodeURIComponent(text)}` : base
}

/** tel: link from an Israeli local number */
export function telLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

/** initials from a Hebrew full name (first letter of first two words) */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
}
