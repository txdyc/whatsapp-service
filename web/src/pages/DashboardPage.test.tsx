import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardPage } from './DashboardPage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DashboardPage />
    </QueryClientProvider>
  );
}

describe('DashboardPage', () => {
  it('renders stat cards from the API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          totalConversations: 100,
          todayConversations: 12,
          activeAiConversations: 80,
          activeHumanConversations: 5,
          pendingHandoffs: 3,
          todayMessages: 240,
          aiResolutionRate: '95.0%',
        }),
        { status: 200 }
      )
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('95.0%')).toBeInTheDocument());
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
