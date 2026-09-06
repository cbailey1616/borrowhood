// No sign-in or credentials are needed for the local Mac design preview.
import { createContext, useContext } from 'react';
import { previewUser } from '../preview/fixtures';
const AuthContext = createContext(null);
const value = { user: previewUser, isLoading: false, isAuthenticated: true, isGracePeriodActive: false, refreshUser: async () => previewUser, logout: async () => window.location.reload() };
export function AuthProvider({ children }) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
