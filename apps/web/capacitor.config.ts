import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The bundle identifier must match the App ID registered in the Apple Developer
 * portal and the app record in App Store Connect. Changing it after the first
 * TestFlight upload means creating a new app record, so settle it before the
 * first build.
 */
const config: CapacitorConfig = {
  appId: 'com.coachos.app',
  appName: 'CoachOS',
  webDir: 'dist',
  ios: {
    // The web layout paints into the safe area itself via env(safe-area-inset-*),
    // so let it own the full screen rather than having WKWebView inset it.
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: {
      // App.tsx hides it once auth and the first dataset have resolved, so the
      // coach never sees a blank screen between launch and the Today list.
      launchAutoHide: false,
      backgroundColor: '#2563c9',
      showSpinner: false,
    },
    Keyboard: {
      // Resize the WebView itself so the bottom sheets and inputs stay visible.
      resize: 'native',
      resizeOnFullScreen: true,
    },
  },
}

export default config
