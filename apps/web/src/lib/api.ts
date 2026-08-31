function readApiBaseUrl(): string {
  const runtimeUrl = window.__API_URL__;
  if (typeof runtimeUrl === 'string' && runtimeUrl.length > 0) {
    return runtimeUrl.replace(/\/$/, '');
  }

  return 'http://localhost:3000';
}

const API_BASE_URL = readApiBaseUrl();

export interface HealthReport {
  status: 'ok' | 'degraded';
  service: string;
  message: string;
  timestamp: string;
  database: {
    reachable: boolean;
    latencyMs: number;
    error?: string;
  };
}

export async function fetchHealth(): Promise<HealthReport> {
  const response = await fetch(`${API_BASE_URL}/api/health`);

  if (!response.ok) {
    throw new Error(`שרת ה-API החזיר שגיאה (${response.status})`);
  }

  return (await response.json()) as HealthReport;
}
