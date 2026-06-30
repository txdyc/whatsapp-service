import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ConversationsPage } from './ConversationsPage';

vi.mock('../services/socket', () => ({
  useSocketEvent: () => {},
  getSocket: () => ({ on: () => {}, off: () => {} }),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ConversationsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ConversationsPage', () => {
  it('renders conversation rows from the API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          conversations: [
            { id: 'c1', contactName: 'Bob', contactPhone: '123', status: 'human', assignedAgentId: null, assignedAgent: null, updatedAt: '2026-06-30T00:00:00Z', createdAt: '2026-06-30T00:00:00Z' },
          ],
          total: 1,
          page: 1,
          limit: 20,
        }),
        { status: 200 }
      )
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('Bob')).toBeInTheDocument());
    expect(screen.getByText('human')).toBeInTheDocument();
  });
});
