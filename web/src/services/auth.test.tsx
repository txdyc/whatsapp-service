import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './auth';
import { TOKEN_KEY } from './apiClient';

function Probe() {
  const { agent, isAuthenticated, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="auth">{isAuthenticated ? 'yes' : 'no'}</span>
      <span data-testid="name">{agent?.name ?? '-'}</span>
      <button onClick={() => login('tok', { id: 'a1', name: 'Alice' })}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => localStorage.clear());

  it('starts unauthenticated and logs in', () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByTestId('auth')).toHaveTextContent('no');
    act(() => screen.getByText('login').click());
    expect(screen.getByTestId('auth')).toHaveTextContent('yes');
    expect(screen.getByTestId('name')).toHaveTextContent('Alice');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('tok');
  });

  it('logout clears token', () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    act(() => screen.getByText('login').click());
    act(() => screen.getByText('logout').click());
    expect(screen.getByTestId('auth')).toHaveTextContent('no');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});
