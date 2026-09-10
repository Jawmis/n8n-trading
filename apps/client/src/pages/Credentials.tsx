import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiCreateCredential, apiListCredentials, apiRevokeCredential, apiTestCredential, type Credential } from '@/lib/http';

export default function Credentials() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [accountIndex, setAccountIndex] = useState('');
  const [apiIndex, setApiIndex] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    try { setCredentials(await apiListCredentials()); } catch { setError('Could not load credentials. Please try again.'); }
  }
  useEffect(() => {
    void apiListCredentials().then(setCredentials).catch(() => setError('Could not load credentials. Please try again.'));
  }, []);

  async function create() {
    setError(null); setMessage(null);
    if (!apiKey || !/^\d+$/.test(accountIndex) || !/^\d+$/.test(apiIndex)) {
      setError('Enter an API private key and numeric account/API key indexes.'); return;
    }
    try {
      await apiCreateCredential('lighter', { apiKey, accountIndex: Number(accountIndex), apiIndex: Number(apiIndex) });
      setApiKey(''); setAccountIndex(''); setApiIndex(''); setMessage('Credential saved.'); await load();
    } catch { setError('Could not save credential.'); }
  }

  return <div className="mx-auto max-w-2xl space-y-6 p-6">
    <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Broker credentials</h1><Link className="underline" to="/dashboard">Back to dashboard</Link></div>
    <section className="space-y-3 rounded-md border bg-background p-4">
      <h2 className="font-medium">Add Lighter credential</h2>
      <p className="text-sm text-muted-foreground">The private key is encrypted by the API and never returned to the client.</p>
      <input className="w-full rounded-md border px-3 py-2" type="password" placeholder="API private key" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
      <div className="grid grid-cols-2 gap-3"><input className="rounded-md border px-3 py-2" inputMode="numeric" placeholder="Account index" value={accountIndex} onChange={(event) => setAccountIndex(event.target.value)} /><input className="rounded-md border px-3 py-2" inputMode="numeric" placeholder="API key index" value={apiIndex} onChange={(event) => setApiIndex(event.target.value)} /></div>
      <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={() => void create()}>Save credential</button>
    </section>
    {error && <p className="text-sm text-red-600">{error}</p>}{message && <p className="text-sm text-green-700">{message}</p>}
    <section className="space-y-3"><h2 className="font-medium">Saved credentials</h2>{credentials.length === 0 ? <p className="text-sm text-muted-foreground">No credentials saved.</p> : credentials.map((credential) => <div className="flex items-center justify-between rounded-md border bg-background p-4" key={credential._id}><div><p className="font-medium">{credential.provider}</p><p className="text-xs text-muted-foreground">{credential._id}</p>{credential.revokedAt && <p className="text-xs text-red-600">Revoked</p>}</div>{!credential.revokedAt && <div className="flex gap-2"><button className="rounded-md border px-3 py-1" onClick={async () => { try { await apiTestCredential(credential._id); setMessage('Credential decrypted successfully.'); } catch { setError('Credential test failed.'); } }}>Test</button><button className="rounded-md border px-3 py-1" onClick={async () => { try { await apiRevokeCredential(credential._id); await load(); setMessage('Credential revoked.'); } catch { setError('Could not revoke credential.'); } }}>Revoke</button></div>}</div>)}</section>
  </div>;
}
