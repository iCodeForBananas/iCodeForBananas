'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/app/hooks/useAuth';

interface PollOption { id: string; label: string; sort_order: number }
interface Poll { id: string; question: string; vote_mode: 'approval' | 'single'; created_at: string; poll_options: PollOption[] }

type View = 'list' | 'create' | 'edit';

export default function PollsPage() {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [view, setView] = useState<View>('list');
  const [editId, setEditId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [voteMode, setVoteMode] = useState<'approval' | 'single'>('approval');
  const [options, setOptions] = useState(['', '']);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('polls')
      .select('id, question, vote_mode, created_at, poll_options(id, label, sort_order)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setPolls((data as Poll[]) ?? []);
  }, [user, supabase]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => { setQuestion(''); setVoteMode('approval'); setOptions(['', '']); setEditId(null); };

  const startEdit = (p: Poll) => {
    setEditId(p.id);
    setQuestion(p.question);
    setVoteMode(p.vote_mode);
    setOptions(p.poll_options.sort((a, b) => a.sort_order - b.sort_order).map(o => o.label));
    setView('edit');
  };

  const save = async () => {
    const filled = options.filter(o => o.trim());
    if (!question.trim() || filled.length < 2 || !user) return;
    setSaving(true);

    if (editId) {
      await supabase.from('polls').update({ question, vote_mode: voteMode }).eq('id', editId);
      await supabase.from('poll_options').delete().eq('poll_id', editId);
      await supabase.from('poll_options').insert(filled.map((label, i) => ({ poll_id: editId, label: label.trim(), sort_order: i })));
    } else {
      const { data: poll } = await supabase.from('polls').insert({ user_id: user.id, question, vote_mode: voteMode }).select('id').single();
      if (poll) {
        await supabase.from('poll_options').insert(filled.map((label, i) => ({ poll_id: poll.id, label: label.trim(), sort_order: i })));
      }
    }

    setSaving(false);
    resetForm();
    setView('list');
    load();
  };

  const copyLink = (id: string, type: 'vote' | 'results') => {
    const url = `${window.location.origin}/polls/${id}/${type}`;
    navigator.clipboard.writeText(url);
    setCopied(id + type);
    setTimeout(() => setCopied(null), 1500);
  };

  const inputStyle = { background: '#1A1B1E', border: '1px solid #373A40', color: '#F8F9FA', borderRadius: 6 };
  const btnStyle = (active?: boolean) => active
    ? { background: '#facc15', color: '#0a0a0a' }
    : { background: '#1A1B1E', border: '1px solid #373A40', color: '#F8F9FA' };

  if (!user) return <div className="p-6" style={{ color: '#909296' }}>Sign in to manage polls.</div>;

  // ── Create / Edit form ──
  if (view === 'create' || view === 'edit') {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <button onClick={() => { resetForm(); setView('list'); }} className="text-sm mb-4" style={{ color: '#facc15' }}>← Back</button>
        <h1 className="text-2xl font-bold mb-6" style={{ color: '#F8F9FA' }}>{view === 'edit' ? 'Edit Poll' : 'Create Poll'}</h1>
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

          <button onClick={save} disabled={saving || !question.trim() || options.filter(o => o.trim()).length < 2} className="px-4 py-2 rounded font-semibold text-sm disabled:opacity-40" style={{ background: '#facc15', color: '#0a0a0a' }}>
            {saving ? 'Saving...' : view === 'edit' ? 'Update Poll' : 'Create Poll'}
          </button>
        </div>
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#F8F9FA' }}>My Polls</h1>
        <a href="/polls/create" className="px-4 py-2 rounded font-semibold text-sm" style={{ background: '#facc15', color: '#0a0a0a' }}>+ New Poll</a>
      </div>

      {polls.length === 0 && <p style={{ color: '#909296' }}>No polls yet. Create one!</p>}

      <div className="flex flex-col gap-3">
        {polls.map(p => (
          <div key={p.id} className="rounded-lg p-4" style={{ background: '#1A1B1E', border: '1px solid #373A40' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-sm" style={{ color: '#F8F9FA' }}>{p.question}</h2>
                <p className="text-xs mt-1" style={{ color: '#909296' }}>
                  {p.vote_mode === 'approval' ? 'Approval voting' : 'Single vote'} · {p.poll_options.length} options · {new Date(p.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => startEdit(p)} className="text-xs px-2 py-1 rounded" style={{ color: '#facc15', border: '1px solid #373A40' }}>Edit</button>
                <button onClick={async () => { if (confirm('Delete this poll?')) { await supabase.from('polls').delete().eq('id', p.id); load(); } }} className="text-xs px-2 py-1 rounded" style={{ color: '#ef4444', border: '1px solid #373A40' }}>Delete</button>
              </div>
            </div>

            <div className="flex gap-2 mt-3 flex-wrap">
              <button onClick={() => copyLink(p.id, 'vote')} className="text-xs px-3 py-1 rounded" style={btnStyle()}>
                {copied === p.id + 'vote' ? '✓ Copied!' : '🔗 Copy Vote Link'}
              </button>
              <button onClick={() => copyLink(p.id, 'results')} className="text-xs px-3 py-1 rounded" style={btnStyle()}>
                {copied === p.id + 'results' ? '✓ Copied!' : '📊 Copy Results Link'}
              </button>
              <a href={`/polls/${p.id}/results`} className="text-xs px-3 py-1 rounded inline-block" style={btnStyle()}>View Results</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
