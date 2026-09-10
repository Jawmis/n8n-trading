import { Link } from 'react-router-dom';
 

export default function Landing() {
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

          <section className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-teal-950/20 backdrop-blur">
            <div className="rounded-2xl bg-slate-900/90 p-5">
              <div className="mb-8 flex items-center justify-between"><div><p className="text-xs uppercase tracking-[0.2em] text-slate-500">Workspace overview</p><p className="mt-1 text-xl font-semibold">Morning momentum</p></div><span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">Paper mode</span></div>
              <div className="space-y-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4"><div className="flex items-center justify-between"><span className="font-medium">Price trigger</span><span className="text-xs text-teal-300">BTC · above 78,000</span></div><div className="mt-3 h-2 rounded-full bg-slate-700"><div className="h-2 w-3/4 rounded-full bg-teal-300" /></div></div>
                <div className="ml-10 rounded-xl border border-white/10 bg-white/[0.04] p-4"><div className="flex items-center justify-between"><span className="font-medium">Lighter action</span><span className="text-xs text-slate-400">LONG · 0.25 BTC</span></div><div className="mt-3 flex items-center gap-2 text-xs text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-300" /> Risk checks enabled</div></div>
                <div className="ml-20 rounded-xl border border-dashed border-teal-300/30 bg-teal-300/5 p-4 text-sm text-teal-100">Execution ready for review →</div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
