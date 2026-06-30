import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../services/auth';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
