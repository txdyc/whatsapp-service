import { createContext, useContext, useState, ReactNode } from 'react';

interface ToastItem { id: number; message: string; type: 'success' | 'error'; }
interface ToastCtx { notify: (message: string, type?: 'success' | 'error') => void; }

const Ctx = createContext<ToastCtx | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    const id = nextId++;
    setItems((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3000);
  };

  return (
    <Ctx.Provider value={{ notify }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={
              'rounded-md px-4 py-2 text-sm text-white shadow ' +
              (t.type === 'success' ? 'bg-brand' : 'bg-red-600')
            }
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
