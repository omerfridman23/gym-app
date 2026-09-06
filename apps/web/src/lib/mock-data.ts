// Domain types for the coach app UI. (The module keeps its original name from
// the prototype era so imports stay stable — the mock datasets themselves are
// gone; all data now comes from the API via lib/data.tsx.)

export type SessionStatus = 'confirmed' | 'pending' | 'cancelled' | 'done'
export type Attendance = 'arrived' | 'no_show'
export type PaymentMethod = 'cash' | 'bit' | 'transfer' | 'card'

export const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'cash', label: 'מזומן' },
  { id: 'bit', label: 'ביט' },
  { id: 'transfer', label: 'העברה' },
  { id: 'card', label: 'אשראי' },
]

export interface Client {
  id: string
  name: string
  phone: string
  fields: Record<string, string>
  packageId?: string
  priceAgorot: number
}

export interface Session {
  id: string
  clientId: string
  typeId: string
  date: string // yyyy-mm-dd (Asia/Jerusalem)
  time: string // HH:MM
  durationMin: number
  location?: string
  priceAgorot: number
  status: SessionStatus
  paid: boolean
  fromPackage: boolean
  reminderSent: boolean
  reminderAnswered: boolean
  attendance?: Attendance
  cancelReason?: string
}

export interface SessionPackage {
  id: string
  clientId: string
  total: number
  remaining: number
  purchasedAgorot: number
  date: string
}

export interface Payment {
  id: string
  clientId: string
  amountAgorot: number
  method: PaymentMethod
  date: string
}

export interface CoachSettings {
  name: string
  defaultPriceAgorot: number
  reminderHoursBefore: number
  cancellationPolicy: string
  templates: { reminder: string; debt: string }
}

export interface Dataset {
  settings: CoachSettings
  clients: Client[]
  sessions: Session[]
  packages: SessionPackage[]
  payments: Payment[]
}
