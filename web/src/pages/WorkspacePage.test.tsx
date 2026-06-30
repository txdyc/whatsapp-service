import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { WorkspacePage } from './WorkspacePage';

vi.mock('../services/socket', () => ({
  useSocketEvent: () => {},
  getSocket: () => ({ on: () => {}, off: () => {} }),
}));

function renderAt(id: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/conversations/${id}`]}>
        <Routes>
          <Route path="/conversations/:id" element={<WorkspacePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function humanConversation() {
  return {
    id: 'c1', contactName: 'Bob', contactPhone: '123', status: 'human',
    assignedAgentId: null, assignedAgent: null,
    updatedAt: '2026-06-30T00:00:00Z', createdAt: '2026-06-30T00:00:00Z',
    messages: [{ id: 'm1', conversationId: 'c1', role: 'user', content: 'I need help', createdAt: '2026-06-30T00:00:00Z' }],
  };
}

describe('WorkspacePage', () => {
  beforeEach(() => localStorage.clear());

  it('renders messages and enables reply when status is human', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(humanConversation()), { status: 200 })
    );
    renderAt('c1');
    await waitFor(() => expect(screen.getByText('I need help')).toBeInTheDocument());
    expect(screen.getByPlaceholderText(/type a reply/i)).toBeEnabled();
  });

  it('disables reply when status is not human', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ...humanConversation(), status: 'ai' }), { status: 200 })
    );
    renderAt('c1');
    await waitFor(() => expect(screen.getByText('I need help')).toBeInTheDocument());
    expect(screen.getByPlaceholderText(/type a reply/i)).toBeDisabled();
  });

  it('sends a reply via the API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(humanConversation()), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValue(new Response(JSON.stringify(humanConversation()), { status: 200 }));
    renderAt('c1');
    await waitFor(() => expect(screen.getByText('I need help')).toBeInTheDocument());
    await userEvent.type(screen.getByPlaceholderText(/type a reply/i), 'On it');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));
    await waitFor(() => {
      const replyCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/reply'));
      expect(replyCall).toBeTruthy();
    });
  });
});
