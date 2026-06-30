import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useConversations } from '../services/queries';
import { useSocketEvent } from '../services/socket';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Table, Thead, Th, Td, Tr } from '../components/ui/Table';
import { ConversationStatus } from '../lib/types';

const filters: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'ai', label: 'AI' },
  { value: 'human', label: 'Human' },
  { value: 'closed', label: 'Closed' },
];

export function ConversationsPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useConversations(status, page);

  // Refresh list when a conversation is handed off to a human.
  useSocketEvent('handoff', () => {
    qc.invalidateQueries({ queryKey: ['conversations'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Conversations</h1>
      <div className="mb-3 flex gap-2">
        {filters.map((f) => (
          <Button
            key={f.value || 'all'}
            variant={status === f.value ? 'primary' : 'secondary'}
            onClick={() => { setStatus(f.value); setPage(1); }}
          >
            {f.label}
          </Button>
        ))}
      </div>
      <Card className="p-0">
        <Table>
          <Thead>
            <tr>
              <Th>Contact</Th>
              <Th>Phone</Th>
              <Th>Status</Th>
              <Th>Agent</Th>
              <Th>Updated</Th>
            </tr>
          </Thead>
          <tbody>
            {isLoading && (
              <tr><Td colSpan={5}>Loading…</Td></tr>
            )}
            {data?.conversations.map((c) => (
              <Tr key={c.id} className="cursor-pointer" onClick={() => navigate(`/conversations/${c.id}`)}>
                <Td>{c.contactName ?? c.contactPhone}</Td>
                <Td>{c.contactPhone}</Td>
                <Td><StatusBadge status={c.status as ConversationStatus} /></Td>
                <Td>{c.assignedAgent?.name ?? '—'}</Td>
                <Td>{new Date(c.updatedAt).toLocaleString()}</Td>
              </Tr>
            ))}
            {data && data.conversations.length === 0 && (
              <tr><Td colSpan={5} className="text-gray-500">No conversations.</Td></tr>
            )}
          </tbody>
        </Table>
      </Card>
      <div className="mt-3 flex items-center justify-end gap-2 text-sm">
        <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
        <span>{page} / {totalPages}</span>
        <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
      </div>
    </div>
  );
}
