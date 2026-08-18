import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiSignin, apiSignup } from '@/lib/http';

export default function Auth() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (mode === 'signin') {
        await apiSignin({ username, password });
      } else {
        await apiSignup({ username, password });
        await apiSignin({ username, password });
      }
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Something went wrong');
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-2xl font-semibold">{mode === 'signin' ? 'Sign In' : 'Sign Up'}</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full max-w-sm">
        <input
          className="border rounded-md px-3 py-2"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="border rounded-md px-3 py-2"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button type="submit" className="px-4 py-2 rounded-md bg-primary text-primary-foreground">
          {mode === 'signin' ? 'Sign In' : 'Sign Up'}
        </button>
      </form>
      <button
        className="text-sm text-muted-foreground underline"
        onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
      >
        {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
      </button>
    </div>
  );
}