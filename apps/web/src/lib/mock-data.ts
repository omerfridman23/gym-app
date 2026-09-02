import type { Vertical } from './vertical-config'
import { addDays, startOfWeek, toISODate } from './format'

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
  date: string // yyyy-mm-dd
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

// --- Date anchoring: everything is relative to the real current week ---
const today = new Date()
const iso = toISODate(today)
const weekStart = startOfWeek(today)
/** date on this week's grid, i = 0 (Sunday) .. 6 (Saturday) */
const wd = (i: number) => toISODate(addDays(weekStart, i))
/** date offset from today (negative = past) */
const rel = (n: number) => toISODate(addDays(today, n))

const HERZLIYA_1 = 'מגרש 1, קאנטרי הרצליה'
const HERZLIYA_2 = 'מגרש 2, קאנטרי הרצליה'
const GLILOT = 'מגרש 4, פאדל גלילות'

// =====================================================================
// PADEL DATASET — coach דני, 12 clients
// =====================================================================
const padelClients: Client[] = [
  { id: 'p1', name: 'רון אביב', phone: '0525551201', fields: { level: 'מתקדם', side: 'ימין' }, priceAgorot: 18000 },
  { id: 'p2', name: 'מאיה לוי', phone: '0545551202', fields: { level: 'בינוני', side: 'שמאל' }, priceAgorot: 18000 },
  { id: 'p3', name: 'שירה גל', phone: '0505551203', fields: { level: 'מתחיל', side: 'גמיש' }, priceAgorot: 16000, packageId: 'pk1' },
  { id: 'p4', name: 'איתי בר', phone: '0525551204', fields: { level: 'תחרותי', side: 'ימין' }, priceAgorot: 20000 },
  { id: 'p5', name: 'דור כהן', phone: '0585551205', fields: { level: 'מתקדם', side: 'שמאל' }, priceAgorot: 18000, packageId: 'pk2' },
  { id: 'p6', name: 'נועה פרץ', phone: '0545551206', fields: { level: 'בינוני', side: 'ימין' }, priceAgorot: 18000 },
  { id: 'p7', name: 'יואב שמש', phone: '0505551207', fields: { level: 'מתקדם', side: 'גמיש' }, priceAgorot: 18000 },
  { id: 'p8', name: 'תמר רון', phone: '0525551208', fields: { level: 'מתחיל', side: 'שמאל' }, priceAgorot: 16000 },
  { id: 'p9', name: 'אלון מזרחי', phone: '0585551209', fields: { level: 'תחרותי', side: 'ימין' }, priceAgorot: 20000, packageId: 'pk3' },
  { id: 'p10', name: 'גל אלון', phone: '0545551210', fields: { level: 'בינוני', side: 'גמיש' }, priceAgorot: 18000 },
  { id: 'p11', name: 'עדי נחום', phone: '0505551211', fields: { level: 'בינוני', side: 'ימין' }, priceAgorot: 18000 },
  { id: 'p12', name: 'יעל אבידן', phone: '0525551212', fields: { level: 'מתחיל', side: 'שמאל' }, priceAgorot: 16000 },
]

const padelPackages: SessionPackage[] = [
  { id: 'pk1', clientId: 'p3', total: 10, remaining: 6, purchasedAgorot: 150000, date: rel(-20) },
  { id: 'pk2', clientId: 'p5', total: 10, remaining: 3, purchasedAgorot: 160000, date: rel(-30) },
  { id: 'pk3', clientId: 'p9', total: 5, remaining: 4, purchasedAgorot: 95000, date: rel(-8) },
]

let ps = 0
const pid = () => `ps${++ps}`

const padelSessions: Session[] = [
  // ---- TODAY (mixed states) ----
  { id: pid(), clientId: 'p1', typeId: 'private', date: iso, time: '08:00', durationMin: 60, location: HERZLIYA_1, priceAgorot: 18000, status: 'confirmed', paid: true, fromPackage: false, reminderSent: true, reminderAnswered: true },
  { id: pid(), clientId: 'p2', typeId: 'private', date: iso, time: '09:00', durationMin: 60, location: HERZLIYA_1, priceAgorot: 18000, status: 'pending', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: false },
  { id: pid(), clientId: 'p4', typeId: 'duo', date: iso, time: '10:30', durationMin: 60, location: HERZLIYA_2, priceAgorot: 20000, status: 'confirmed', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true },
  { id: pid(), clientId: 'p3', typeId: 'private', date: iso, time: '16:00', durationMin: 60, location: HERZLIYA_2, priceAgorot: 0, status: 'confirmed', paid: true, fromPackage: true, reminderSent: true, reminderAnswered: true },
  { id: pid(), clientId: 'p6', typeId: 'private', date: iso, time: '18:00', durationMin: 60, location: HERZLIYA_1, priceAgorot: 18000, status: 'pending', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: false },
  { id: pid(), clientId: 'p5', typeId: 'private', date: iso, time: '19:00', durationMin: 60, location: HERZLIYA_2, priceAgorot: 0, status: 'confirmed', paid: true, fromPackage: true, reminderSent: true, reminderAnswered: true },
  { id: pid(), clientId: 'p7', typeId: 'group', date: iso, time: '20:00', durationMin: 60, location: GLILOT, priceAgorot: 12000, status: 'cancelled', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true, cancelReason: 'מזג אוויר' },

  // ---- REST OF THIS WEEK (upcoming, for the calendar) ----
  { id: pid(), clientId: 'p8', typeId: 'private', date: wd(0), time: '17:00', durationMin: 60, location: HERZLIYA_1, priceAgorot: 16000, status: 'confirmed', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true },
  { id: pid(), clientId: 'p9', typeId: 'private', date: wd(1), time: '07:00', durationMin: 60, location: HERZLIYA_2, priceAgorot: 0, status: 'confirmed', paid: true, fromPackage: true, reminderSent: true, reminderAnswered: true },
  { id: pid(), clientId: 'p10', typeId: 'duo', date: wd(1), time: '18:30', durationMin: 60, location: HERZLIYA_1, priceAgorot: 18000, status: 'pending', paid: false, fromPackage: false, reminderSent: false, reminderAnswered: false },
  { id: pid(), clientId: 'p11', typeId: 'private', date: wd(2), time: '09:00', durationMin: 60, location: HERZLIYA_1, priceAgorot: 18000, status: 'confirmed', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true },
  { id: pid(), clientId: 'p1', typeId: 'private', date: wd(2), time: '19:00', durationMin: 60, location: HERZLIYA_2, priceAgorot: 18000, status: 'confirmed', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true },
  { id: pid(), clientId: 'p12', typeId: 'private', date: wd(3), time: '16:00', durationMin: 60, location: HERZLIYA_1, priceAgorot: 16000, status: 'pending', paid: false, fromPackage: false, reminderSent: false, reminderAnswered: false },
  { id: pid(), clientId: 'p4', typeId: 'private', date: wd(3), time: '20:00', durationMin: 60, location: HERZLIYA_2, priceAgorot: 20000, status: 'confirmed', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true },
  { id: pid(), clientId: 'p2', typeId: 'private', date: wd(4), time: '08:00', durationMin: 60, location: HERZLIYA_1, priceAgorot: 18000, status: 'confirmed', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true },
  { id: pid(), clientId: 'p6', typeId: 'duo', date: wd(4), time: '17:30', durationMin: 60, location: GLILOT, priceAgorot: 18000, status: 'pending', paid: false, fromPackage: false, reminderSent: false, reminderAnswered: false },
  { id: pid(), clientId: 'p3', typeId: 'private', date: wd(5), time: '10:00', durationMin: 60, location: HERZLIYA_1, priceAgorot: 0, status: 'confirmed', paid: true, fromPackage: true, reminderSent: true, reminderAnswered: true },
  { id: pid(), clientId: 'p7', typeId: 'private', date: wd(5), time: '11:00', durationMin: 60, location: HERZLIYA_2, priceAgorot: 18000, status: 'confirmed', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true },
  { id: pid(), clientId: 'p9', typeId: 'private', date: wd(6), time: '09:30', durationMin: 60, location: HERZLIYA_1, priceAgorot: 0, status: 'confirmed', paid: true, fromPackage: true, reminderSent: true, reminderAnswered: true },

  // ---- PAST THIS WEEK (already happened, some unpaid → debt) ----
  { id: pid(), clientId: 'p4', typeId: 'private', date: rel(-1), time: '18:00', durationMin: 60, location: HERZLIYA_2, priceAgorot: 20000, status: 'done', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true, attendance: 'arrived' },
  { id: pid(), clientId: 'p2', typeId: 'private', date: rel(-2), time: '09:00', durationMin: 60, location: HERZLIYA_1, priceAgorot: 18000, status: 'done', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true, attendance: 'arrived' },
  { id: pid(), clientId: 'p6', typeId: 'private', date: rel(-2), time: '19:00', durationMin: 60, location: HERZLIYA_1, priceAgorot: 18000, status: 'done', paid: true, fromPackage: false, reminderSent: true, reminderAnswered: true, attendance: 'arrived' },
  { id: pid(), clientId: 'p10', typeId: 'private', date: rel(-3), time: '17:00', durationMin: 60, location: HERZLIYA_1, priceAgorot: 18000, status: 'done', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true, attendance: 'no_show' },

  // ---- OLDER (debt aging) ----
  { id: pid(), clientId: 'p4', typeId: 'private', date: rel(-5), time: '18:00', durationMin: 60, location: HERZLIYA_2, priceAgorot: 20000, status: 'done', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true, attendance: 'arrived' },
  { id: pid(), clientId: 'p4', typeId: 'private', date: rel(-9), time: '18:00', durationMin: 60, location: HERZLIYA_2, priceAgorot: 20000, status: 'done', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true, attendance: 'arrived' },
  { id: pid(), clientId: 'p8', typeId: 'private', date: rel(-6), time: '17:00', durationMin: 60, location: HERZLIYA_1, priceAgorot: 16000, status: 'done', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true, attendance: 'arrived' },
  { id: pid(), clientId: 'p8', typeId: 'private', date: rel(-13), time: '17:00', durationMin: 60, location: HERZLIYA_1, priceAgorot: 16000, status: 'done', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true, attendance: 'arrived' },
  { id: pid(), clientId: 'p11', typeId: 'private', date: rel(-4), time: '09:00', durationMin: 60, location: HERZLIYA_1, priceAgorot: 18000, status: 'done', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true, attendance: 'arrived' },
  { id: pid(), clientId: 'p12', typeId: 'private', date: rel(-7), time: '16:00', durationMin: 60, location: HERZLIYA_1, priceAgorot: 16000, status: 'done', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true, attendance: 'arrived' },
  { id: pid(), clientId: 'p12', typeId: 'private', date: rel(-12), time: '16:00', durationMin: 60, location: HERZLIYA_1, priceAgorot: 16000, status: 'done', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true, attendance: 'arrived' },
  { id: pid(), clientId: 'p1', typeId: 'private', date: rel(-6), time: '08:00', durationMin: 60, location: HERZLIYA_1, priceAgorot: 18000, status: 'done', paid: true, fromPackage: false, reminderSent: true, reminderAnswered: true, attendance: 'arrived' },
  { id: pid(), clientId: 'p7', typeId: 'private', date: rel(-8), time: '11:00', durationMin: 60, location: HERZLIYA_2, priceAgorot: 18000, status: 'done', paid: true, fromPackage: false, reminderSent: true, reminderAnswered: true, attendance: 'arrived' },
]

const padelPayments: Payment[] = [
  { id: 'pp1', clientId: 'p6', amountAgorot: 18000, method: 'bit', date: rel(-2) },
  { id: 'pp2', clientId: 'p1', amountAgorot: 18000, method: 'cash', date: rel(-6) },
  { id: 'pp3', clientId: 'p7', amountAgorot: 18000, method: 'transfer', date: rel(-8) },
  { id: 'pp4', clientId: 'p3', amountAgorot: 150000, method: 'card', date: rel(-20) },
  { id: 'pp5', clientId: 'p5', amountAgorot: 160000, method: 'bit', date: rel(-30) },
  { id: 'pp6', clientId: 'p9', amountAgorot: 95000, method: 'cash', date: rel(-8) },
]

// =====================================================================
// FITNESS DATASET — coach preview, 8 clients
// =====================================================================
const fitnessClients: Client[] = [
  { id: 'f1', name: 'עומר דיין', phone: '0525552301', fields: { goal: 'מסה', notes: 'כאב בכתף ימין' }, priceAgorot: 16000 },
  { id: 'f2', name: 'ליאור כץ', phone: '0545552302', fields: { goal: 'חיטוב', notes: '' }, priceAgorot: 16000 },
  { id: 'f3', name: 'הדס ברק', phone: '0505552303', fields: { goal: 'שיקום', notes: 'אחרי ניתוח ברך' }, priceAgorot: 18000, packageId: 'fk1' },
  { id: 'f4', name: 'ניר שלו', phone: '0525552304', fields: { goal: 'כוח', notes: '' }, priceAgorot: 16000 },
  { id: 'f5', name: 'רותם אשר', phone: '0585552305', fields: { goal: 'כללי', notes: 'מתחילה' }, priceAgorot: 15000 },
  { id: 'f6', name: 'טל הראל', phone: '0545552306', fields: { goal: 'חיטוב', notes: '' }, priceAgorot: 16000, packageId: 'fk2' },
  { id: 'f7', name: 'שקד מור', phone: '0505552307', fields: { goal: 'מסה', notes: 'צמחוני' }, priceAgorot: 16000 },
  { id: 'f8', name: 'אורי נבו', phone: '0525552308', fields: { goal: 'כוח', notes: '' }, priceAgorot: 17000 },
]

const fitnessPackages: SessionPackage[] = [
  { id: 'fk1', clientId: 'f3', total: 12, remaining: 5, purchasedAgorot: 200000, date: rel(-25) },
  { id: 'fk2', clientId: 'f6', total: 8, remaining: 2, purchasedAgorot: 120000, date: rel(-18) },
]

let fs = 0
const fid = () => `fss${++fs}`

const fitnessSessions: Session[] = [
  // TODAY
  { id: fid(), clientId: 'f1', typeId: 'private', date: iso, time: '06:30', durationMin: 50, priceAgorot: 16000, status: 'confirmed', paid: true, fromPackage: false, reminderSent: true, reminderAnswered: true },
  { id: fid(), clientId: 'f2', typeId: 'private', date: iso, time: '08:00', durationMin: 50, priceAgorot: 16000, status: 'pending', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: false },
  { id: fid(), clientId: 'f3', typeId: 'private', date: iso, time: '10:00', durationMin: 50, priceAgorot: 0, status: 'confirmed', paid: true, fromPackage: true, reminderSent: true, reminderAnswered: true },
  { id: fid(), clientId: 'f4', typeId: 'duet', date: iso, time: '17:00', durationMin: 50, priceAgorot: 16000, status: 'confirmed', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true },
  { id: fid(), clientId: 'f6', typeId: 'small', date: iso, time: '19:00', durationMin: 50, priceAgorot: 0, status: 'confirmed', paid: true, fromPackage: true, reminderSent: true, reminderAnswered: true },
  // THIS WEEK
  { id: fid(), clientId: 'f5', typeId: 'private', date: wd(1), time: '09:00', durationMin: 50, priceAgorot: 15000, status: 'confirmed', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true },
  { id: fid(), clientId: 'f7', typeId: 'private', date: wd(2), time: '18:00', durationMin: 50, priceAgorot: 16000, status: 'pending', paid: false, fromPackage: false, reminderSent: false, reminderAnswered: false },
  { id: fid(), clientId: 'f8', typeId: 'private', date: wd(3), time: '07:00', durationMin: 50, priceAgorot: 17000, status: 'confirmed', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true },
  { id: fid(), clientId: 'f1', typeId: 'private', date: wd(4), time: '06:30', durationMin: 50, priceAgorot: 16000, status: 'confirmed', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true },
  // PAST / DEBT
  { id: fid(), clientId: 'f2', typeId: 'private', date: rel(-1), time: '08:00', durationMin: 50, priceAgorot: 16000, status: 'done', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true, attendance: 'arrived' },
  { id: fid(), clientId: 'f4', typeId: 'private', date: rel(-3), time: '17:00', durationMin: 50, priceAgorot: 16000, status: 'done', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true, attendance: 'arrived' },
  { id: fid(), clientId: 'f4', typeId: 'private', date: rel(-10), time: '17:00', durationMin: 50, priceAgorot: 16000, status: 'done', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true, attendance: 'arrived' },
  { id: fid(), clientId: 'f8', typeId: 'private', date: rel(-5), time: '07:00', durationMin: 50, priceAgorot: 17000, status: 'done', paid: false, fromPackage: false, reminderSent: true, reminderAnswered: true, attendance: 'arrived' },
  { id: fid(), clientId: 'f5', typeId: 'private', date: rel(-2), time: '09:00', durationMin: 50, priceAgorot: 15000, status: 'done', paid: true, fromPackage: false, reminderSent: true, reminderAnswered: true, attendance: 'arrived' },
]

const fitnessPayments: Payment[] = [
  { id: 'fp1', clientId: 'f5', amountAgorot: 15000, method: 'cash', date: rel(-2) },
  { id: 'fp2', clientId: 'f3', amountAgorot: 200000, method: 'card', date: rel(-25) },
  { id: 'fp3', clientId: 'f6', amountAgorot: 120000, method: 'transfer', date: rel(-18) },
]

export const DATASETS: Record<Vertical, Dataset> = {
  padel: {
    settings: {
      name: 'דני',
      defaultPriceAgorot: 18000,
      reminderHoursBefore: 24,
      cancellationPolicy: 'ביטול עד 12 שעות לפני האימון ללא חיוב. ביטול מאוחר יותר מחויב במלוא הסכום.',
      templates: {
        reminder: 'היי {שם}, מזכיר לך את האימון מחר ב-{שעה} ב{מיקום}. מאשר/ת? {קישור}',
        debt: 'היי {שם}, נותר חוב פתוח של {סכום} על {מספר} אימונים. אפשר להסדיר כאן: {קישור}',
      },
    },
    clients: padelClients,
    sessions: padelSessions,
    packages: padelPackages,
    payments: padelPayments,
  },
  fitness: {
    settings: {
      name: 'דני',
      defaultPriceAgorot: 16000,
      reminderHoursBefore: 12,
      cancellationPolicy: 'ביטול עד 8 שעות לפני האימון ללא חיוב. ביטול מאוחר יותר מחויב במלוא הסכום.',
      templates: {
        reminder: 'היי {שם}, מזכיר לך את האימון מחר ב-{שעה}. מאשר/ת? {קישור}',
        debt: 'היי {שם}, נותר חוב פתוח של {סכום} על {מספר} אימונים. אפשר להסדיר כאן: {קישור}',
      },
    },
    clients: fitnessClients,
    sessions: fitnessSessions,
    packages: fitnessPackages,
    payments: fitnessPayments,
  },
}

/** The reference "today" used across the app, so mock data lines up with the UI. */
export const TODAY_ISO = iso
