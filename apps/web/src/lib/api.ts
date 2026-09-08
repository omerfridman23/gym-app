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
  templates?: { reminder?: string; debt?: string };
  bookingSlug?: string | null;
  bookingEnabled?: boolean;
  bookingStartHour?: number;
  bookingEndHour?: number;
}

export interface CoachProfile {
  id: string;
  phone: string;
  name: string;
  vertical: 'padel' | 'fitness' | null;
  defaultPriceAgorot: number;
  reminderHoursBefore: number;
  cancellationPolicy: string;
  templates: { reminder?: string; debt?: string };
  onboarded: boolean;
  bookingSlug: string | null;
  bookingEnabled: boolean;
  bookingStartHour: number;
  bookingEndHour: number;
}

// --- Raw API row shapes (dates are ISO strings, money is agorot) ---

export interface ApiClient {
  id: string;
  name: string;
  phone: string;
  fields: Record<string, string>;
  priceAgorot: number;
}

export interface ApiSession {
  id: string;
  clientId: string;
  seriesId: string | null;
  confirmToken: string;
  typeId: string;
  startsAt: string;
  durationMin: number;
  location: string | null;
  priceAgorot: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'done';
  paid: boolean;
  packageId: string | null;
  reminderSent: boolean;
  reminderAnswered: boolean;
  attendance: 'arrived' | 'no_show' | null;
  cancelReason: string | null;
}

export interface ApiPayment {
  id: string;
  clientId: string;
  amountAgorot: number;
  method: 'cash' | 'bit' | 'transfer' | 'card';
  paidAt: string;
}

export interface ApiPackage {
  id: string;
  clientId: string;
  totalSessions: number;
  purchasedAgorot: number;
  purchasedAt: string;
  remaining: number;
}

/** A session whose reminder is due now, with the message already rendered. */
export interface ApiDueReminder {
  sessionId: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  startsAt: string;
  timeLocal: string;
  durationMin: number;
  location: string | null;
  message: string;
  confirmUrl: string;
  whatsappUrl: string;
}

export interface CreateSessionInput {
  clientId: string;
  typeId: string;
  startsAt: string;
  durationMin: number;
  location?: string;
  priceAgorot: number;
  repeatWeekly?: boolean;
}

export interface UpdateSessionInput {
  status?: 'pending' | 'confirmed' | 'cancelled' | 'done';
  cancelReason?: string | null;
  paid?: boolean;
  attendance?: 'arrived' | 'no_show' | null;
  reminderSent?: boolean;
  reminderAnswered?: boolean;
}

export const dataApi = {
  async getProfile(): Promise<CoachProfile> {
    const { coach } = await request<{ coach: CoachProfile }>('/coaches/me');
    return coach;
  },

  async updateProfile(input: UpdateCoachInput): Promise<CoachProfile> {
    const { profile } = await request<{ profile: CoachProfile }>('/coaches/me', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return profile;
  },

  async listClients(): Promise<ApiClient[]> {
    const { clients } = await request<{ clients: ApiClient[] }>('/clients');
    return clients;
  },

  async createClient(input: {
    name: string;
    phone: string;
    fields: Record<string, string>;
    priceAgorot: number;
  }): Promise<ApiClient> {
    const { client } = await request<{ client: ApiClient }>('/clients', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return client;
  },

  async listSessions(fromIso: string, toIso: string): Promise<ApiSession[]> {
    const query = new URLSearchParams({ from: fromIso, to: toIso });
    const { sessions } = await request<{ sessions: ApiSession[] }>(`/sessions?${query}`);
    return sessions;
  },

  async createSession(input: CreateSessionInput): Promise<ApiSession[]> {
    const { sessions } = await request<{ sessions: ApiSession[] }>('/sessions', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return sessions;
  },

  async updateSession(id: string, input: UpdateSessionInput): Promise<ApiSession> {
    const { session } = await request<{ session: ApiSession }>(`/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return session;
  },

  async listPayments(): Promise<ApiPayment[]> {
    const { payments } = await request<{ payments: ApiPayment[] }>('/payments');
    return payments;
  },

  async createPayment(input: {
    clientId: string;
    amountAgorot: number;
    method: 'cash' | 'bit' | 'transfer' | 'card';
    sessionIds?: string[];
  }): Promise<ApiPayment> {
    const { payment } = await request<{ payment: ApiPayment }>('/payments', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return payment;
  },

  async listPackages(): Promise<ApiPackage[]> {
    const { packages } = await request<{ packages: ApiPackage[] }>('/packages');
    return packages;
  },

  async listDueReminders(): Promise<ApiDueReminder[]> {
    const { reminders } = await request<{ reminders: ApiDueReminder[] }>('/reminders/due');
    return reminders;
  },

  async markReminderSent(sessionId: string): Promise<void> {
    await request(`/reminders/${sessionId}/sent`, { method: 'POST' });
  },
};

// --- Public token links (no auth) ---

export interface PublicConfirmInfo {
  clientFirstName: string;
  coachName: string;
  startsAt: string;
  durationMin: number;
  location: string | null;
  status: 'pending' | 'confirmed' | 'cancelled' | 'done';
}

export interface PublicPayInfo {
  clientFirstName: string;
  coachName: string;
  sessions: { id: string; startsAt: string; priceAgorot: number }[];
  totalAgorot: number;
}

export interface PublicBookingSlot {
  startsAt: string;
  timeLocal: string;
}

export interface PublicBookingDay {
  date: string;
  slots: PublicBookingSlot[];
}

export interface PublicBookingInfo {
  coachName: string;
  vertical: 'padel' | 'fitness' | null;
  durationMin: number;
  priceAgorot: number;
  days: PublicBookingDay[];
}

export interface PublicBookingResult {
  coachName: string;
  clientFirstName: string;
  startsAt: string;
  date: string;
  timeLocal: string;
  durationMin: number;
}

export const publicApi = {
  async getConfirmInfo(token: string): Promise<PublicConfirmInfo> {
    const { info } = await request<{ info: PublicConfirmInfo }>(`/public/confirm/${token}`);
    return info;
  },

  async answerConfirm(token: string, answer: 'confirm' | 'decline'): Promise<PublicConfirmInfo> {
    const { info } = await request<{ info: PublicConfirmInfo }>(
      `/public/confirm/${token}/answer`,
      { method: 'POST', body: JSON.stringify({ answer }) },
    );
    return info;
  },

  async getPayInfo(clientId: string): Promise<PublicPayInfo> {
    const { info } = await request<{ info: PublicPayInfo }>(`/public/pay/${clientId}`);
    return info;
  },

  async getBookingInfo(slug: string): Promise<PublicBookingInfo> {
    const { info } = await request<{ info: PublicBookingInfo }>(`/public/book/${slug}`);
    return info;
  },

  async createBooking(
    slug: string,
    input: { startsAt: string; name: string; phone: string },
  ): Promise<PublicBookingResult> {
    const { booking } = await request<{ booking: PublicBookingResult }>(`/public/book/${slug}`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return booking;
  },
};

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
