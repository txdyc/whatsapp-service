import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useLogin } from '../services/queries';
import { useAuth } from '../services/auth';
import { ApiError } from '../services/apiClient';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';

interface FormValues { email: string; password: string; }

export function LoginPage() {
  const { register, handleSubmit } = useForm<FormValues>();
  const login = useLogin();
  const auth = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const onSubmit = (values: FormValues) => {
    setError('');
    login.mutate(values, {
      onSuccess: (data) => {
        auth.login(data.token, data.agent);
        navigate('/');
      },
      onError: (err) => setError(err instanceof ApiError ? err.message : 'Login failed'),
    });
  };

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-6 text-xl font-semibold">WhatsApp Admin</h1>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
            <Input id="email" type="email" autoComplete="username" {...register('email', { required: true })} />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">Password</label>
            <Input id="password" type="password" autoComplete="current-password" {...register('password', { required: true })} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
