import { createContext, useContext, useState, ReactNode } from 'react';
import { Agent } from '../lib/types';
import { TOKEN_KEY } from './apiClient';

const AGENT_KEY = 'wa_admin_agent';

interface AuthCtx {
  agent: Agent | null;
  isAuthenticated: boolean;
  login: (token: string, agent: Agent) => void;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

function readAgent(): Agent | null {
  const raw = localStorage.getItem(AGENT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Agent;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<Agent | null>(() =>
    localStorage.getItem(TOKEN_KEY) ? readAgent() : null
  );

  const login = (token: string, nextAgent: Agent) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(AGENT_KEY, JSON.stringify(nextAgent));
    setAgent(nextAgent);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(AGENT_KEY);
    setAgent(null);
  };

  return (
    <Ctx.Provider value={{ agent, isAuthenticated: !!agent, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
