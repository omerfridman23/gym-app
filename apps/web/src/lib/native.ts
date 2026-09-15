import { Capacitor } from '@capacitor/core'

/**
 * True only inside the packaged iOS/Android shell. The browser build — including
 * the PWA installed to the home screen — reports false and keeps using cookies.
 */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

export function nativePlatform(): 'ios' | 'android' | 'web' {
  const platform = Capacitor.getPlatform()
  return platform === 'ios' || platform === 'android' ? platform : 'web'
}
