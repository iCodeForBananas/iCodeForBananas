'use client';

import { useState, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    router.push('/workout-tracker');
    router.refresh();
  };

  return (
    <main className="px-4 py-6 flex-1 metronome-static">
      <div className="w-full lg:max-w-5xl lg:mx-auto">
        <div className="rounded-lg p-6 bg-white">
          <form onSubmit={handleLogin} className="w-full max-w-sm mx-auto space-y-4 py-12">
            <h1 className="text-2xl font-bold text-center">Sign In</h1>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full border border-[#373A40]/30 rounded px-3 py-2 text-sm" />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full border border-[#373A40]/30 rounded px-3 py-2 text-sm" />
            <button type="submit" disabled={loading}
              className="w-full rounded bg-black px-5 py-2 text-sm font-medium text-[#facc15] hover:bg-black/80 disabled:opacity-50">
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
