import { useDashboard } from '../services/queries';
import { Card } from '../components/ui/Card';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </Card>
  );
}

export function DashboardPage() {
  const { data, isLoading, isError } = useDashboard();

  if (isLoading) return <p>Loading…</p>;
  if (isError || !data) return <p className="text-red-600">Failed to load dashboard.</p>;

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Today's Conversations" value={data.todayConversations} />
        <Stat label="AI Resolution Rate" value={data.aiResolutionRate} />
        <Stat label="Pending Handoffs" value={data.pendingHandoffs} />
        <Stat label="Today's Messages" value={data.todayMessages} />
        <Stat label="Active AI" value={data.activeAiConversations} />
        <Stat label="Active Human" value={data.activeHumanConversations} />
        <Stat label="Total Conversations" value={data.totalConversations} />
      </div>
    </div>
  );
}
