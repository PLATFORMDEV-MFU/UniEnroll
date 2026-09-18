'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AuthUser } from '../types';
import {
  api,
  getStoredToken,
  setStoredToken,
  getStoredUser,
  setStoredUser,
  setUnauthorizedListener,
} from './api';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (studentCode: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const logout = useCallback(() => {
    setStoredToken(null);
    setStoredUser(null);
    setToken(null);
    setUser(null);
    if (pathname !== '/login') {
      router.push('/login');
    }
  }, [pathname, router]);

  // Initial session restoration
  useEffect(() => {
    const initAuth = async () => {
      const savedToken = getStoredToken();
      const savedUser = getStoredUser();

      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(savedUser);

        // Verify token in background
        try {
          const res = await api.getMe();
          if (res.success && res.data) {
            setUser(res.data);
            setStoredUser(res.data);
          } else if (res.status === 401) {
            logout();
          }
        } catch {
          // If network error, keep using saved user offline/resiliently
        }
      }
      setIsLoading(false);
    };

    initAuth();
    setUnauthorizedListener(() => {
      logout();
    });

    return () => {
      setUnauthorizedListener(null);
    };
  }, [logout]);

  const login = async (studentCode: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await api.login(studentCode, password);
      if (res.success && res.token && res.user) {
        setStoredToken(res.token);
        setStoredUser(res.user);
        setToken(res.token);
        setUser(res.user);
        return { success: true };
      }
      return {
        success: false,
        error: res.error || res.message || 'Invalid student code or password',
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Network error connecting to login server',
      };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

const defaultAuthContext: AuthContextType = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => ({ success: false, error: 'Auth context not ready' }),
  logout: () => {},
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    return defaultAuthContext;
  }
  return context;
}

