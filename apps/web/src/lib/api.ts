function readApiBaseUrl(): string {
  const runtimeUrl = window.__API_URL__;
  if (typeof runtimeUrl === 'string' && runtimeUrl.length > 0) {
    return runtimeUrl.replace(/\/$/, '');
  }

  return 'http://localhost:3000';
}

const API_BASE_URL = readApiBaseUrl();

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api${path}`, {
    credentials: 'include',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });

  if (!response.ok) {
    let message = `שגיאת שרת (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string | string[] };
      if (body.message) message = Array.isArray(body.message) ? body.message[0] : body.message;
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface CoachSession {
  id: string;
  phone: string;
  name: string;
  vertical: 'padel' | 'fitness' | null;
  onboarded: boolean;
}

export interface UpdateCoachInput {
  name?: string;
  vertical?: 'padel' | 'fitness';
  defaultPriceAgorot?: number;
  reminderHoursBefore?: number;
  cancellationPolicy?: string;
}

export const authApi = {
  requestOtp(phone: string): Promise<void> {
    return request('/auth/otp/request', { method: 'POST', body: JSON.stringify({ phone }) });
  },

  async verifyOtp(phone: string, code: string): Promise<CoachSession> {
    const { coach } = await request<{ coach: CoachSession }>('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    });
    return coach;
  },

  async me(): Promise<CoachSession | null> {
    try {
      const { coach } = await request<{ coach: CoachSession | null }>('/auth/me');
      return coach;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },

  logout(): Promise<void> {
    return request('/auth/logout', { method: 'POST' });
  },

  async updateCoach(input: UpdateCoachInput): Promise<CoachSession> {
    const { coach } = await request<{ coach: CoachSession }>('/coaches/me', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return coach;
  },
};
