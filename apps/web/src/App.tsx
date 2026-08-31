import { useCallback, useEffect, useState } from 'react'
import { fetchHealth, type HealthReport } from './lib/api'

type LoadState =
  | { phase: 'loading' }
  | { phase: 'loaded'; report: HealthReport }
  | { phase: 'error'; message: string }

function App() {
  const [state, setState] = useState<LoadState>({ phase: 'loading' })

  const loadHealth = useCallback(async () => {
    setState({ phase: 'loading' })

    try {
      const report = await fetchHealth()
      setState({ phase: 'loaded', report })
    } catch (error) {
      setState({
        phase: 'error',
        message: error instanceof Error ? error.message : 'שגיאה לא מזוהה',
      })
    }
  }, [])

  useEffect(() => {
    void loadHealth()
  }, [loadHealth])

  return (
    <main className="page">
      <section className="card">
        <header className="card__header">
          <span className="card__eyebrow">בדיקת תקינות</span>
          <h1 className="card__title" dir="ltr">
            Roy — bring the fucking clients.
          </h1>
          <p className="card__subtitle">מאמנים אישיים</p>
        </header>

        {state.phase === 'loading' && <p className="status">טוען נתונים…</p>}

        {state.phase === 'error' && (
          <div className="status status--error">
            <strong>אין חיבור לשרת</strong>
            <p>{state.message}</p>
          </div>
        )}

        {state.phase === 'loaded' && (
          <>
            <p className="message">{state.report.message}</p>

            <dl className="metrics">
              <div className="metric">
                <dt>שרת API</dt>
                <dd>
                  <span
                    className={`badge ${
                      state.report.status === 'ok' ? 'badge--ok' : 'badge--warn'
                    }`}
                  >
                    {state.report.status === 'ok' ? 'תקין' : 'מוגבל'}
                  </span>
                </dd>
              </div>

              <div className="metric">
                <dt>מסד נתונים</dt>
                <dd>
                  <span
                    className={`badge ${
                      state.report.database.reachable ? 'badge--ok' : 'badge--error'
                    }`}
                  >
                    {state.report.database.reachable ? 'מחובר' : 'לא מחובר'}
                  </span>
                </dd>
              </div>

              <div className="metric">
                <dt>זמן תגובה</dt>
                <dd>{state.report.database.latencyMs} מ״ש</dd>
              </div>

              <div className="metric">
                <dt>עודכן</dt>
                <dd>{new Date(state.report.timestamp).toLocaleTimeString('he-IL')}</dd>
              </div>
            </dl>
          </>
        )}

        <button type="button" className="refresh" onClick={() => void loadHealth()}>
          רענון בדיקה
        </button>
      </section>
    </main>
  )
}

export default App
