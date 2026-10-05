const TOKEN_KEY = 'rms.token';

// Rows come straight from the database views, so they are loosely typed maps.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export interface Page {
  items: Row[];
  page: number;
  size: number;
  hasMore: boolean;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string | null) =>
  token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);

type Query = Record<string, string | number | boolean | null | undefined>;

function withQuery(path: string, query?: Query) {
  if (!query) return path;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const token = getToken();
  const response = await fetch(withQuery(`/api${path}`, query), {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && path !== '/auth/login') {
    // expired or revoked session
    setToken(null);
    window.dispatchEvent(new Event('rms:unauthorized'));
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    const fallback = response.status === 403 ? 'You are not allowed to do that' : `Request failed (${response.status})`;
    throw new ApiError(response.status, data?.message || fallback);
  }
  return data as T;
}

export const api = {
  get: <T = Row[]>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T = void>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T = void>(path: string, body: unknown = {}) => request<T>('PUT', path, body),
  delete: <T = void>(path: string) => request<T>('DELETE', path),
};
