import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
 

export default function Landing() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setActiveStep((step) => (step + 1) % 4), 1400);
    return () => window.clearInterval(timer);
  }, []);

  const nodeState = (step: number) => activeStep === step ? 'border-white bg-white text-slate-950 shadow-[0_0_24px_rgba(255,255,255,0.35)]' : activeStep > step ? 'border-slate-400 bg-slate-800 text-white' : 'border-white/15 bg-white/[0.04] text-slate-300';

  return (
    <div className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(20,184,166,0.18),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.16),transparent_32%)]" />
      <div className="relative mx-auto max-w-6xl px-6 pb-16">
        <nav className="flex items-center justify-between py-6">
          <Link to="/" className="flex items-center gap-3 text-lg font-semibold tracking-tight">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-400 font-bold text-slate-950">N</span>
            N8N Trading
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/auth" className="rounded-lg px-4 py-2 text-slate-300 transition hover:bg-white/10 hover:text-white">Sign in</Link>
            <Link to="/auth?mode=signup" className="rounded-lg bg-white px-4 py-2 font-medium text-slate-950 transition hover:bg-teal-100">Create account</Link>
          </div>
        </nav>

        <main className="grid items-center gap-14 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
          <section>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-300/10 px-3 py-1 text-sm text-teal-200">
              <span className="h-2 w-2 rounded-full bg-teal-300" /> Visual trading automation
            </div>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">Build trading workflows that run with clarity.</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">Connect triggers, risk controls, and broker actions in one visual workspace. Monitor every execution without losing sight of the safeguards.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/auth?mode=signup" className="rounded-xl bg-teal-300 px-5 py-3 font-semibold text-slate-950 shadow-lg shadow-teal-950/30 transition hover:bg-teal-200">Start building free</Link>
              <Link to="/auth" className="rounded-xl border border-white/15 px-5 py-3 font-medium text-white transition hover:bg-white/10">Sign in to workspace</Link>
            </div>
            <div className="mt-10 flex gap-8 text-sm text-slate-400"><span><strong className="block text-xl text-white">Visual</strong>workflow editor</span><span><strong className="block text-xl text-white">Live</strong>execution history</span><span><strong className="block text-xl text-white">Safe</strong>paper-first defaults</span></div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-teal-950/20 backdrop-blur" aria-label="Animated example workflow">
            <div className="rounded-2xl bg-slate-900/90 p-5">
              <div className="mb-8 flex items-center justify-between"><div><p className="text-xs uppercase tracking-[0.2em] text-slate-500">Live workflow preview</p><p className="mt-1 text-xl font-semibold">Morning momentum</p></div><span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">Paper mode</span></div>
              <div className="overflow-x-auto pb-3" aria-live="polite">
                <div className="flex min-w-[700px] items-center justify-between gap-2 px-2 py-8">
                  <div className="flex w-32 flex-col items-center gap-3 text-center"><div className={`!rounded-full flex h-28 w-28 flex-col items-center justify-center border-2 p-3 transition-all duration-500 ${nodeState(0)}`}><span className="text-2xl">◉</span><span className="mt-1 text-xs font-semibold">PRICE</span><span className="text-[10px] opacity-70">BTC &gt; 78K</span></div><span className="text-[10px] uppercase tracking-widest text-slate-500">Trigger</span></div>
                  <div className={`h-0.5 min-w-10 flex-1 transition-all duration-700 ${activeStep > 0 ? 'bg-white shadow-[0_0_10px_white]' : 'bg-white/20'}`} />
                  <div className="flex w-32 flex-col items-center gap-3 text-center"><div className={`!rounded-full flex h-28 w-28 flex-col items-center justify-center border-2 p-3 transition-all duration-500 ${nodeState(1)}`}><span className="text-2xl">◇</span><span className="mt-1 text-xs font-semibold">RISK</span><span className="text-[10px] opacity-70">0.25 BTC</span></div><span className="text-[10px] uppercase tracking-widest text-slate-500">Validate</span></div>
                  <div className={`h-0.5 min-w-10 flex-1 transition-all duration-700 ${activeStep > 1 ? 'bg-white shadow-[0_0_10px_white]' : 'bg-white/20'}`} />
                  <div className="flex w-32 flex-col items-center gap-3 text-center"><div className={`!rounded-full flex h-28 w-28 flex-col items-center justify-center border-2 p-3 transition-all duration-500 ${nodeState(2)}`}><span className="text-2xl">↗</span><span className="mt-1 text-xs font-semibold">LIGHTER</span><span className="text-[10px] opacity-70">LONG</span></div><span className="text-[10px] uppercase tracking-widest text-slate-500">Execute</span></div>
                  <div className={`h-0.5 min-w-10 flex-1 transition-all duration-700 ${activeStep > 2 ? 'bg-white shadow-[0_0_10px_white]' : 'bg-white/20'}`} />
                  <div className="flex w-32 flex-col items-center gap-3 text-center"><div className={`!rounded-full flex h-28 w-28 flex-col items-center justify-center border-2 p-3 transition-all duration-500 ${activeStep === 3 ? 'border-white bg-white text-slate-950 shadow-[0_0_24px_rgba(255,255,255,0.45)]' : 'border-dashed border-white/20 bg-white/[0.03] text-slate-400'}`}><span className="text-2xl">✓</span><span className="mt-1 text-[10px] font-semibold">{activeStep === 3 ? 'BOUGHT' : 'RESULT'}</span><span className="text-[10px] opacity-70">PAPER ORDER</span></div><span className="text-[10px] uppercase tracking-widest text-slate-500">{activeStep === 3 ? 'Complete' : 'Waiting'}</span></div>
                </div>
                <p className="text-center text-xs text-slate-500">{activeStep === 3 ? 'SIMULATED BUY: 0.25 BTC at 78,012.40' : 'Execution moves left to right through each node'}</p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
