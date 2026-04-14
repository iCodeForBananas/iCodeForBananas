'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/app/hooks/useAuth';

export default function CreatePollPage() {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [question, setQuestion] = useState('');
  const [voteMode, setVoteMode] = useState<'approval' | 'single'>('approval');
  const [options, setOptions] = useState(['', '']);
  const [saving, setSaving] = useState(false);

  const canSave = question.trim() && options.filter(o => o.trim()).length >= 2 && user;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const filled = options.filter(o => o.trim());
    const { data: poll } = await supabase.from('polls').insert({ user_id: user!.id, question, vote_mode: voteMode }).select('id').single();
    if (poll) {
      await supabase.from('poll_options').insert(filled.map((label, i) => ({ poll_id: poll.id, label: label.trim(), sort_order: i })));
    }
    setSaving(false);
    router.push('/polls');
  };

  const inputStyle = { background: '#1A1B1E', border: '1px solid #373A40', color: '#F8F9FA', borderRadius: 6 };
  const btnStyle = (active?: boolean) => active
    ? { background: '#facc15', color: '#0a0a0a' }
    : { background: '#1A1B1E', border: '1px solid #373A40', color: '#F8F9FA' };

  if (!user) return <div className="p-6" style={{ color: '#909296' }}>Sign in to create polls.</div>;

  return (
    <div className="p-6 max-w-xl mx-auto">
      <a href="/polls" className="text-sm mb-4 inline-block" style={{ color: '#facc15' }}>← Back</a>
      <h1 className="text-2xl font-bold mb-6" style={{ color: '#F8F9FA' }}>Create Poll</h1>
      <div className="flex flex-col gap-4">
        <input placeholder="Your question..." value={question} onChange={e => setQuestion(e.target.value)} className="px-3 py-2 text-sm" style={inputStyle} />

        <div className="flex gap-2 items-center">
          <span className="text-sm" style={{ color: '#909296' }}>Vote mode:</span>
          {(['approval', 'single'] as const).map(m => (
            <button key={m} onClick={() => setVoteMode(m)} className="px-3 py-1 rounded text-sm font-medium" style={btnStyle(voteMode === m)}>
              {m === 'approval' ? 'Approval' : 'Single Vote'}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm" style={{ color: '#909296' }}>Options (min 2):</span>
          {options.map((opt, i) => (
            <div key={i} className="flex gap-2">
              <input placeholder={`Option ${i + 1}`} value={opt} onChange={e => { const n = [...options]; n[i] = e.target.value; setOptions(n); }} className="flex-1 px-3 py-2 text-sm" style={inputStyle} />
              {options.length > 2 && <button onClick={() => setOptions(options.filter((_, idx) => idx !== i))} className="px-2 text-sm" style={{ color: '#909296' }}>✕</button>}
            </div>
          ))}
          <button onClick={() => setOptions([...options, ''])} className="text-sm self-start px-3 py-1 rounded" style={{ color: '#facc15' }}>+ Add option</button>
        </div>

        <button onClick={save} disabled={!canSave || saving} className="px-4 py-2 rounded font-semibold text-sm disabled:opacity-40" style={{ background: '#facc15', color: '#0a0a0a' }}>
          {saving ? 'Saving...' : 'Create Poll'}
        </button>
      </div>
    </div>
  );
}
