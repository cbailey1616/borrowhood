import { createContext, useContext } from 'react';
import { user } from './fixtures';
const Context = createContext(null);
const value = { user, isLoading: false, isAuthenticated: true, isGracePeriodActive: false, refreshUser: async () => user, logout: async () => {} };
export function AuthProvider({ children }) { return <Context.Provider value={value}>{children}</Context.Provider>; }
export function useAuth() { return useContext(Context); }
