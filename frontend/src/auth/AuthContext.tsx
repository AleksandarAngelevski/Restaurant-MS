import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setToken } from '../api/client';

export type Role = 'WAITER' | 'MANAGER' | 'SUPERVISOR' | 'HOST' | 'ADMIN' | 'KITCHEN';

export interface User {
  id: number;
  name: string;
  email: string;
  roles: string[];
}

// Mirrors mk.finki.rms.common.Roles on the backend (which is what actually enforces access).
export const MANAGEMENT: Role[] = ['MANAGER', 'SUPERVISOR', 'ADMIN'];
export const FLOOR: Role[] = ['WAITER', ...MANAGEMENT];
export const FLOOR_OR_HOST: Role[] = ['HOST', ...FLOOR];
export const KITCHEN: Role[] = ['KITCHEN', ...MANAGEMENT];
export const RESERVATIONS: Role[] = ['HOST', ...MANAGEMENT];
export const STAFF_OVERVIEW: Role[] = ['SUPERVISOR', 'ADMIN'];
export const ADMIN: Role[] = ['ADMIN'];

interface AuthState {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (roles: Role[]) => boolean;
}

const USER_KEY = 'rms.user';
const AuthContext = createContext<AuthState | null>(null);

function storedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(storedUser);

  const logout = useCallback(() => {
    setToken(null);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.post<{ token: string; user: User }>('/auth/login', { email, password });
    setToken(result.token);
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    setUser(result.user);
  }, []);

  useEffect(() => {
    window.addEventListener('rms:unauthorized', logout);
    return () => window.removeEventListener('rms:unauthorized', logout);
  }, [logout]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      login,
      logout,
      can: (roles) => !!user && roles.some((role) => user.roles.includes(role)),
    }),
    [user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
