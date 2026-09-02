export const VERTICAL_CONFIG = {
  padel: {
    terms: { client: 'שחקן', clients: 'שחקנים', session: 'אימון', location: 'מגרש', calendar: 'יומן' },
    sessionTypes: [
      { id: 'private', label: 'פרטי', capacity: 1 },
      { id: 'duo', label: 'זוגי', capacity: 2 },
      { id: 'group', label: 'קבוצתי', capacity: 4 },
    ],
    clientFields: [
      {
        key: 'level',
        label: 'רמת משחק',
        type: 'select',
        options: ['מתחיל', 'בינוני', 'מתקדם', 'תחרותי'],
      },
      {
        key: 'side',
        label: 'צד במגרש',
        type: 'select',
        options: ['ימין', 'שמאל', 'גמיש'],
      },
    ],
    cancelReasons: ['מזג אוויר', 'המגרש לא זמין', 'המתאמן ביטל', 'המאמן ביטל'],
    defaultDuration: 60,
    requiresLocation: true,
  },
  fitness: {
    terms: { client: 'מתאמן', clients: 'מתאמנים', session: 'אימון', location: 'מיקום', calendar: 'יומן' },
    sessionTypes: [
      { id: 'private', label: 'אישי', capacity: 1 },
      { id: 'duet', label: 'זוגי', capacity: 2 },
      { id: 'small', label: 'קבוצה קטנה', capacity: 6 },
    ],
    clientFields: [
      {
        key: 'goal',
        label: 'מטרה',
        type: 'select',
        options: ['חיטוב', 'מסה', 'כוח', 'שיקום', 'כללי'],
      },
      { key: 'notes', label: 'הערות ומגבלות', type: 'text' },
    ],
    cancelReasons: ['המתאמן ביטל', 'המאמן ביטל', 'חדר הכושר סגור'],
    defaultDuration: 50,
    requiresLocation: false,
  },
} as const

export type Vertical = keyof typeof VERTICAL_CONFIG
export type VerticalConfig = (typeof VERTICAL_CONFIG)[Vertical]
export type SessionType = VerticalConfig['sessionTypes'][number]
export type ClientField = VerticalConfig['clientFields'][number]
