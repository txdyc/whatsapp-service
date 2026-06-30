import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../services/auth';
import { cn } from '../../lib/utils';

const nav = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/conversations', label: 'Conversations', end: false },
  { to: '/knowledge', label: 'Knowledge Base', end: false },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { agent, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-56 flex-col border-r border-gray-200 bg-white">
        <div className="px-4 py-5 text-lg font-semibold text-brand">WA Admin</div>
        <nav className="flex-1 space-y-1 px-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn('block rounded-md px-3 py-2 text-sm', isActive ? 'bg-brand text-white' : 'text-gray-700 hover:bg-gray-100')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
          <div />
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-600">{agent?.name}</span>
            <button onClick={handleLogout} className="text-gray-500 hover:text-gray-900">Logout</button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
