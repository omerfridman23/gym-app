import { afterEach, describe, expect, it, vi } from 'vitest'

function response(
  status: number,
  body: unknown,
  options: { jsonRejects?: boolean } = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: options.jsonRejects
      ? vi.fn().mockRejectedValue(new SyntaxError('not json'))
      : vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

async function loadApi(apiUrl?: string) {
  vi.resetModules()
  vi.stubGlobal('window', { __API_URL__: apiUrl })
  return import('./api')
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('API request transport', () => {
  it('defaults to localhost:3000 and always sends cookies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, { clients: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const { dataApi } = await loadApi()

    await dataApi.listClients()

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/clients', {
      credentials: 'include',
      headers: undefined,
    })
  })

  it('uses same-origin relative requests when the runtime URL is an empty string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(204, undefined))
    vi.stubGlobal('fetch', fetchMock)
    const { authApi } = await loadApi('')

    await authApi.requestOtp('0501234567')

    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/otp/request')
  })

  it('uses the runtime API URL and removes one trailing slash', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, { payments: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const { dataApi } = await loadApi('https://api.example.com/')

    await dataApi.listPayments()

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/api/payments')
  })

  it('adds JSON content type only when a body exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(204, undefined))
    vi.stubGlobal('fetch', fetchMock)
    const { authApi } = await loadApi()

    await authApi.requestOtp('0501234567')

    expect(fetchMock.mock.calls[0][1]).toEqual({
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({ phone: '0501234567' }),
    })
  })

  it('does not try to parse a 204 response', async () => {
    const res = response(204, undefined)
    const fetchMock = vi.fn().mockResolvedValue(res)
    vi.stubGlobal('fetch', fetchMock)
    const { authApi } = await loadApi()

    await expect(authApi.logout()).resolves.toBeUndefined()
    expect(res.json).not.toHaveBeenCalled()
  })

  it('uses a scalar server message in ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(400, { message: 'טלפון לא תקין' })))
    const { ApiError, authApi } = await loadApi()

    const error = await authApi.requestOtp('x').catch((value: unknown) => value)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 400, message: 'טלפון לא תקין' })
  })

  it('uses the first ValidationPipe message when the server returns an array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(400, { message: ['first problem', 'second problem'] })),
    )
    const { authApi } = await loadApi()

    const error = await authApi.requestOtp('x').catch((value: unknown) => value)

    expect((error as Error).message).toBe('first problem')
  })

  it('falls back to a generic Hebrew error for non-JSON failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(502, undefined, { jsonRejects: true })),
    )
    const { authApi } = await loadApi()

    const error = await authApi.requestOtp('x').catch((value: unknown) => value)

    expect(error).toMatchObject({ status: 502, message: 'שגיאת שרת (502)' })
  })

  it('falls back when a JSON error has no message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(500, { error: 'internal' })))
    const { authApi } = await loadApi()

    const error = await authApi.requestOtp('x').catch((value: unknown) => value)

    expect((error as Error).message).toBe('שגיאת שרת (500)')
    expect((error as Error).message).not.toContain('internal')
  })

  it('lets network failures propagate unchanged', async () => {
    const offline = new TypeError('Failed to fetch')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(offline))
    const { dataApi } = await loadApi()
    await expect(dataApi.listClients()).rejects.toBe(offline)
  })
})

describe('authApi', () => {
  it('returns null only for a 401 session probe', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(401, { message: 'Unauthorized' })))
    const { authApi } = await loadApi()
    await expect(authApi.me()).resolves.toBeNull()
  })

  it('does not disguise a 500 session probe as logged out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(500, {})))
    const { ApiError, authApi } = await loadApi()
    await expect(authApi.me()).rejects.toBeInstanceOf(ApiError)
  })

  it('unwraps the coach after OTP verification', async () => {
    const coach = { id: 'c1', phone: '+972501234567', name: '', vertical: null, onboarded: false }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, { coach })))
    const { authApi } = await loadApi()
    await expect(authApi.verifyOtp('0501234567', '123456')).resolves.toEqual(coach)
  })
})

describe('native session token', () => {
  /**
   * Loads api.ts as the packaged iOS build sees it: native platform, an absolute
   * build-time API URL, and a Preferences store standing in for UserDefaults.
   */
  async function loadNativeApi(
    stored: string | null = null,
    apiUrl = 'https://api.example.com',
  ) {
    vi.resetModules()
    vi.stubGlobal('window', {})
    vi.stubEnv('VITE_API_URL', apiUrl)

    const store = new Map<string, string>()
    if (stored !== null) store.set('coach_session_token', stored)

    const preferences = {
      get: vi.fn(async ({ key }: { key: string }) => ({ value: store.get(key) ?? null })),
      set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
        store.set(key, value)
      }),
      remove: vi.fn(async ({ key }: { key: string }) => {
        store.delete(key)
      }),
    }

    vi.doMock('./native', () => ({
      isNativePlatform: () => true,
      nativePlatform: () => 'ios',
    }))
    vi.doMock('@capacitor/preferences', () => ({ Preferences: preferences }))

    return { api: await import('./api'), preferences, store }
  }

  afterEach(() => {
    vi.doUnmock('./native')
    vi.doUnmock('@capacitor/preferences')
    vi.unstubAllEnvs()
  })

  it('builds requests against the compiled-in API origin', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, { clients: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await loadNativeApi()

    await api.dataApi.listClients()

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/api/clients')
  })

  it('attaches the stored token as a bearer header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, { clients: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await loadNativeApi('stored.jwt')

    await api.dataApi.listClients()

    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      Authorization: 'Bearer stored.jwt',
    })
  })

  it('sends no bearer header before the coach has logged in', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, { clients: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await loadNativeApi(null)

    await api.dataApi.listClients()

    expect(fetchMock.mock.calls[0][1].headers).toBeUndefined()
  })

  it('reads the stored token only once across many requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, { clients: [] })))
    const { api, preferences } = await loadNativeApi('stored.jwt')

    await Promise.all([
      api.dataApi.listClients(),
      api.dataApi.listClients(),
      api.dataApi.listClients(),
    ])

    expect(preferences.get).toHaveBeenCalledTimes(1)
  })

  it('asks for the token instead of a cookie when verifying an OTP', async () => {
    const coach = { id: 'c1', phone: '+972501234567', name: '', vertical: null, onboarded: false }
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response(200, { coach, token: 'fresh.jwt' }))
    vi.stubGlobal('fetch', fetchMock)
    const { api, store } = await loadNativeApi()

    await expect(api.authApi.verifyOtp('0501234567', '123456')).resolves.toEqual(coach)

    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ 'X-Auth-Mode': 'token' })
    expect(store.get('coach_session_token')).toBe('fresh.jwt')
  })

  it('uses the new token immediately after logging in, without re-reading storage', async () => {
    const coach = { id: 'c1', phone: '+972501234567', name: '', vertical: null, onboarded: false }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(200, { coach, token: 'fresh.jwt' }))
      .mockResolvedValue(response(200, { clients: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await loadNativeApi()

    await api.authApi.verifyOtp('0501234567', '123456')
    await api.dataApi.listClients()

    expect(fetchMock.mock.calls[1][1].headers).toEqual({
      Authorization: 'Bearer fresh.jwt',
    })
  })

  it('refuses a login the server did not issue a token for', async () => {
    const coach = { id: 'c1', phone: '+972501234567', name: '', vertical: null, onboarded: false }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, { coach })))
    const { api, store } = await loadNativeApi()

    await expect(api.authApi.verifyOtp('0501234567', '123456')).rejects.toBeInstanceOf(
      api.ApiError,
    )
    expect(store.has('coach_session_token')).toBe(false)
  })

  it('drops a rejected token so the next launch shows the login screen', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(401, { message: 'Unauthorized' })))
    const { api, store } = await loadNativeApi('expired.jwt')

    await expect(api.authApi.me()).resolves.toBeNull()

    expect(store.has('coach_session_token')).toBe(false)
  })

  it('keeps the token when the session probe fails for a non-auth reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(500, {})))
    const { api, store } = await loadNativeApi('good.jwt')

    await expect(api.authApi.me()).rejects.toBeInstanceOf(api.ApiError)

    expect(store.get('coach_session_token')).toBe('good.jwt')
  })

  it('clears the local token even when the logout request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const { api, store } = await loadNativeApi('good.jwt')

    await expect(api.authApi.logout()).rejects.toBeInstanceOf(TypeError)

    expect(store.has('coach_session_token')).toBe(false)
  })

  it('fails the build rather than shipping an app with no API URL', async () => {
    vi.stubGlobal('fetch', vi.fn())
    await expect(loadNativeApi(null, '')).rejects.toThrow(/VITE_API_URL/)
  })
})

describe('dataApi and publicApi endpoint contracts', () => {
  it('URL-encodes session range query values', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, { sessions: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const { dataApi } = await loadApi()

    await dataApi.listSessions('2026-09-01T00:00:00+03:00', '2026-10-01T00:00:00+03:00')

    expect(fetchMock.mock.calls[0][0]).toContain(
      'from=2026-09-01T00%3A00%3A00%2B03%3A00&to=2026-10-01T00%3A00%3A00%2B03%3A00',
    )
  })

  it('sends the exact public answer verb and token route', async () => {
    const info = { status: 'confirmed' }
    const fetchMock = vi.fn().mockResolvedValue(response(200, { info }))
    vi.stubGlobal('fetch', fetchMock)
    const { publicApi } = await loadApi()

    await expect(publicApi.answerConfirm('token-1', 'confirm')).resolves.toBe(info)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/public/confirm/token-1/answer',
      {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        body: JSON.stringify({ answer: 'confirm' }),
      },
    )
  })

  it('unwraps the pay-info response', async () => {
    const info = { clientFirstName: 'יוסי', coachName: 'דני', sessions: [], totalAgorot: 0 }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, { info })))
    const { publicApi } = await loadApi()
    await expect(publicApi.getPayInfo('client-1')).resolves.toBe(info)
  })
})
