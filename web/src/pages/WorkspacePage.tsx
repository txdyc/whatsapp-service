import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useConversation, useReply, useCloseConversation } from '../services/queries';
import { useSocketEvent } from '../services/socket';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Textarea } from '../components/ui/Input';
import { StatusBadge } from '../components/ui/Badge';
import { Message, ConversationStatus } from '../lib/types';

function Bubble({ message }: { message: Message }) {
  const align = message.role === 'user' ? 'items-start' : 'items-end';
  const color =
    message.role === 'user' ? 'bg-white border border-gray-200'
    : message.role === 'bot' ? 'bg-blue-50' : 'bg-brand text-white';
  return (
    <div className={`flex flex-col ${align}`}>
      <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${color}`}>{message.content}</div>
      <span className="mt-0.5 text-[11px] text-gray-400">{message.role}</span>
    </div>
  );
}

export function WorkspacePage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { data, isLoading } = useConversation(id);
  const reply = useReply(id);
  const closeConv = useCloseConversation(id);
  const [text, setText] = useState('');

  const onNewMessage = useCallback(
    (payload: { conversationId: string }) => {
      if (payload.conversationId === id) {
        qc.invalidateQueries({ queryKey: ['conversation', id] });
      }
    },
    [id, qc]
  );
  useSocketEvent('new_message', onNewMessage);

  if (isLoading || !data) return <p>Loading…</p>;

  const isHuman = (data.status as ConversationStatus) === 'human';

  const send = () => {
    const message = text.trim();
    if (!message) return;
    reply.mutate(message, { onSuccess: () => setText('') });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{data.contactName ?? data.contactPhone}</h1>
          <p className="text-sm text-gray-500">{data.contactPhone}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={data.status as ConversationStatus} />
          {data.status !== 'closed' && (
            <Button variant="danger" onClick={() => closeConv.mutate()} disabled={closeConv.isPending}>
              Close
            </Button>
          )}
        </div>
      </div>

      <Card className="flex-1 space-y-3 overflow-auto">
        {data.messages.map((m) => <Bubble key={m.id} message={m} />)}
      </Card>

      <div className="mt-3 flex gap-2">
        <Textarea
          rows={2}
          placeholder={isHuman ? 'Type a reply…' : 'Type a reply — available when this conversation is in Human mode'}
          value={text}
          disabled={!isHuman || reply.isPending}
          onChange={(e) => setText(e.target.value)}
        />
        <Button onClick={send} disabled={!isHuman || reply.isPending || !text.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
