import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Role, User } from '@/types';
import {
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  getCurrentUser,
} from '@/api';
import { setAuthToken } from '@/lib/apiClient';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  theme: 'light' | 'dark';
  loginWithCredentials: (email: string, password: string) => Promise<void>;
  registerUser: (data: {
    email: string;
    password: string;
    name: string;
    role: 'candidate' | 'company';
  }) => Promise<void>;
  logout: () => void;
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      theme: 'light',
      
      // Real API login
      loginWithCredentials: async (email: string, password: string) => {
        try {
          const response = await apiLogin(email, password);
          set({ user: response.user, isAuthenticated: true });
        } catch (error) {
          console.error('Login failed:', error);
          throw error;
        }
      },

      // Register new user
      registerUser: async (data) => {
        try {
          const response = await apiRegister(data);
          set({ user: response.user, isAuthenticated: true });
        } catch (error) {
          console.error('Registration failed:', error);
          throw error;
        }
      },
      
      logout: async () => {
        try {
          await apiLogout();
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          setAuthToken(null);
          set({ user: null, isAuthenticated: false });
        }
      },
      
      refreshUser: async () => {
        try {
          const user = await getCurrentUser();
          set({ user, isAuthenticated: true });
        } catch (error) {
          console.error('Failed to refresh user:', error);
          setAuthToken(null);
          set({ user: null, isAuthenticated: false });
        }
      },
      
      toggleTheme: () => {
        const newTheme = get().theme === 'light' ? 'dark' : 'light';
        set({ theme: newTheme });
        document.documentElement.classList.toggle('dark', newTheme === 'dark');
      },
      
      setTheme: (theme: 'light' | 'dark') => {
        set({ theme });
        document.documentElement.classList.toggle('dark', theme === 'dark');
      },
    }),
    {
      name: 'cv-matcher-auth',
    }
  )
);
