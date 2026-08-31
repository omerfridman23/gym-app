const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

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
