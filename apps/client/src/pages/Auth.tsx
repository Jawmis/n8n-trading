import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { apiSignin, apiSignup } from '@/lib/http';
import axios from 'axios';

export default function Auth() {
  const location = useLocation();
  const [mode, setMode] = useState<'signin' | 'signup'>(() => new URLSearchParams(location.search).get('mode') === 'signup' ? 'signup' : 'signin');
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
    } catch (err: unknown) {
      const message = axios.isAxiosError<{ message?: string }>(err) ? err.response?.data?.message : undefined;
      setError(message ?? 'Something went wrong');
    }
  }

  return (
    <div className="grid min-h-screen bg-slate-950 text-white lg:grid-cols-2">
      <div className="hidden flex-col justify-between p-12 lg:flex"><Link to="/" className="flex items-center gap-3 text-lg font-semibold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-300 font-bold text-slate-950">N</span>N8N Trading</Link><div><p className="mb-4 text-sm uppercase tracking-[0.2em] text-teal-300">Your trading workspace</p><h2 className="max-w-lg text-5xl font-semibold leading-tight">Turn an idea into a repeatable workflow.</h2><p className="mt-5 max-w-md leading-7 text-slate-400">Design, validate, and monitor your automated strategies from one focused dashboard.</p></div><p className="text-sm text-slate-500">Paper mode is enabled by default.</p></div>
      <div className="flex items-center justify-center bg-slate-50 px-6 py-12 text-slate-950">
      <div className="w-full max-w-md">
      <Link to="/" className="mb-10 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900">← Back to home</Link>
      <h1 className="text-3xl font-semibold tracking-tight">{mode === 'signin' ? 'Welcome back' : 'Create your workspace'}</h1>
      <p className="mt-2 text-slate-500">{mode === 'signin' ? 'Sign in to manage your trading workflows.' : 'Start building with paper trading enabled.'}</p>
      <form onSubmit={handleSubmit} className="mt-8 flex w-full flex-col gap-4">
        <input
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <button type="submit" className="rounded-xl bg-slate-950 px-4 py-3 font-medium text-white transition hover:bg-slate-800">
          {mode === 'signin' ? 'Sign In' : 'Sign Up'}
        </button>
      </form>
      <button
        className="mt-6 text-sm text-slate-500 underline underline-offset-4 hover:text-slate-950"
        onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
      >
        {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
      </button>
      </div></div>
    </div>
  );
}
