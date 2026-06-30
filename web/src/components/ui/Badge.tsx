import { cn } from '../../lib/utils';
import { ConversationStatus } from '../../lib/types';

const statusStyles: Record<ConversationStatus, string> = {
  ai: 'bg-blue-100 text-blue-700',
  human: 'bg-amber-100 text-amber-700',
  closed: 'bg-gray-100 text-gray-600',
};

export function StatusBadge({ status }: { status: ConversationStatus }) {
  return (
    <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', statusStyles[status])}>
      {status}
    </span>
  );
}
