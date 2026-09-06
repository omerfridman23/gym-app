import type { Client, Dataset, Session } from './mock-data'

// Public token pages (/confirm/:id, /pay/:id) are client-facing links that
// must work without a coach login. They previously ran on mock data; the real
// token-based public API is not built yet, so lookups return "not found" and
// the pages show their expired-link state.

export interface PublicClientInfo {
  dataset: Dataset
  client: Client
  coachName: string
}

export function findClientAnywhere(_id: string): PublicClientInfo | undefined {
  return undefined
}

export function findSessionAnywhere(
  _id: string,
): { dataset: Dataset; session: Session; client?: Client; coachName: string } | undefined {
  return undefined
}

export function publicUnpaid(_dataset: Dataset, _clientId: string): Session[] {
  return []
}
