import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiRequest } from '@/lib/queryClient';

interface User {
  id: string;
  email: string;
  plan: string;
  planStatus: string;
  isAdmin: boolean;
  workspaceOwnerId?: string;
  firstName?: string;
  lastName?: string;
  usageMessages: number;
  usageStorageMb: number;
  usageWhatsappGroups: number;
  usagePeriodStart: string;
  usagePeriodEnd: string;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName: string, lastName?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('auth_token');
  });
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user && !!token;

  // Load user data on app start
  useEffect(() => {
    const loadUser = async () => {
      const savedToken = localStorage.getItem('auth_token');
      console.debug('🔐 AuthProvider Debug:', { hasToken: !!savedToken, tokenPrefix: savedToken?.slice(0, 20) + '...' });
      if (savedToken) {
        try {
          const response = await apiRequest('GET', '/api/auth/me', undefined, {
            headers: {
              'Authorization': `Bearer ${savedToken}`
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            setUser(data.user);
            setToken(savedToken);
          } else {
            // Token is invalid, clear it
            localStorage.removeItem('auth_token');
            setToken(null);
          }
        } catch (error) {
          console.error('Failed to load user:', error);
          localStorage.removeItem('auth_token');
          setToken(null);
        }
      }
      setIsLoading(false);
    };

    loadUser();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await apiRequest('POST', '/api/auth/login', {
        email,
        password,
      });

      const data = await response.json();
      setUser(data.user);
      setToken(data.token);
      localStorage.setItem('auth_token', data.token);
    } catch (error: any) {
      // Extract error message from the API response
      if (error.message && error.message.includes('401:')) {
        const errorText = error.message.replace('401: ', '');
        try {
          const errorData = JSON.parse(errorText);
          throw new Error(errorData.error || 'Invalid email or password');
        } catch {
          throw new Error('Invalid email or password');
        }
      }
      throw new Error(error.message || 'Login failed');
    }
  };

  const register = async (email: string, password: string, firstName: string, lastName?: string) => {
    const response = await apiRequest('POST', '/api/auth/register', {
      email,
      password,
      firstName,
      lastName,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Registration failed');
    }

    const data = await response.json();
    setUser(data.user);
    setToken(data.token);
    localStorage.setItem('auth_token', data.token);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('auth_token');
  };

  const refreshUser = async () => {
    if (!token) return;

    try {
      const response = await apiRequest('GET', '/api/auth/me', undefined, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isLoading,
      isAuthenticated,
      login,
      register,
      logout,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}