import { DATASETS, type Client, type Dataset, type Session } from './mock-data'
import { isUnpaidDebt } from './data'

export interface PublicClientInfo {
  dataset: Dataset
  client: Client
  coachName: string
}

/** Find a client by id across every vertical dataset (public links have no vertical context). */
export function findClientAnywhere(id: string): PublicClientInfo | undefined {
  for (const dataset of Object.values(DATASETS)) {
    const client = dataset.clients.find((c) => c.id === id)
    if (client) return { dataset, client, coachName: dataset.settings.name }
  }
  return undefined
}

/** Find a session by id across every vertical dataset. */
export function findSessionAnywhere(
  id: string,
): { dataset: Dataset; session: Session; client?: Client; coachName: string } | undefined {
  for (const dataset of Object.values(DATASETS)) {
    const session = dataset.sessions.find((s) => s.id === id)
    if (session) {
      const client = dataset.clients.find((c) => c.id === session.clientId)
      return { dataset, session, client, coachName: dataset.settings.name }
    }
  }
  return undefined
}

export function publicUnpaid(dataset: Dataset, clientId: string): Session[] {
  return dataset.sessions
    .filter((s) => s.clientId === clientId && isUnpaidDebt(s))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}
