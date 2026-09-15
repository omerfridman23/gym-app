import { Preferences } from '@capacitor/preferences'
import { isNativePlatform } from './native'

const STORAGE_KEY = 'coach_session_token'

/**
 * Where the session JWT lives on native.
 *
 * The browser build authenticates with an httpOnly cookie and never calls into
 * here. WKWebView cannot hold that cookie (the app runs on capacitor://localhost,
 * so a SameSite=Lax cookie scoped to the API origin is never attached), so the
 * native build keeps the same JWT itself and sends it as a bearer token.
 *
 * Storage is Preferences (UserDefaults), which is sandboxed to the app but not
 * encrypted at rest and is included in device backups. Moving to the Keychain
 * means replacing only the three calls in this file.
 */
let cached: string | null = null
let hydration: Promise<void> | null = null

async function hydrate(): Promise<void> {
  if (!isNativePlatform()) return
  const { value } = await Preferences.get({ key: STORAGE_KEY })
  cached = value ?? null
}

/**
 * Resolves once the stored token has been read from disk. Every request awaits
 * this, so the first call after a cold start cannot race ahead of the token and
 * bounce the coach to the login screen.
 */
export function sessionTokenReady(): Promise<void> {
  if (!isNativePlatform()) return Promise.resolve()
  hydration ??= hydrate()
  return hydration
}

export async function getSessionToken(): Promise<string | null> {
  await sessionTokenReady()
  return cached
}

export async function setSessionToken(token: string): Promise<void> {
  cached = token
  if (!isNativePlatform()) return
  hydration = Promise.resolve()
  await Preferences.set({ key: STORAGE_KEY, value: token })
}

export async function clearSessionToken(): Promise<void> {
  cached = null
  if (!isNativePlatform()) return
  hydration = Promise.resolve()
  await Preferences.remove({ key: STORAGE_KEY })
}
