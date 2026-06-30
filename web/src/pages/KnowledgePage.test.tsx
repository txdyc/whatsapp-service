import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KnowledgePage } from './KnowledgePage';
import { ToastProvider } from '../components/ui/Toast';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <KnowledgePage />
      </ToastProvider>
    </QueryClientProvider>
  );
}

const docs = {
  docs: [
    { id: 'd1', title: 'Return Policy', content: '30 days', category: 'policy', source: 'manual', createdAt: '2026-06-30T00:00:00Z', updatedAt: '2026-06-30T00:00:00Z' },
  ],
};

describe('KnowledgePage', () => {
  beforeEach(() => localStorage.clear());

  it('lists knowledge docs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(docs), { status: 200 }));
    renderPage();
    await waitFor(() => expect(screen.getByText('Return Policy')).toBeInTheDocument());
  });

  it('triggers WooCommerce sync', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(docs), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ synced: 5 }), { status: 200 }))
      .mockResolvedValue(new Response(JSON.stringify(docs), { status: 200 }));
    renderPage();
    await waitFor(() => expect(screen.getByText('Return Policy')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /sync woocommerce/i }));
    await waitFor(() => {
      const syncCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/knowledge/sync'));
      expect(syncCall).toBeTruthy();
    });
  });
});
