'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

interface Option { id: string; label: string; sort_order: number }
interface Poll { id: string; question: string; vote_mode: 'approval' | 'single' }

function getVoterToken(pollId: string): string | null {
  const match = document.cookie.match(new RegExp(`poll_${pollId}=([^;]+)`));
  return match ? match[1] : null;
}

function setVoterToken(pollId: string, token: string) {
  document.cookie = `poll_${pollId}=${token}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

export default function VotePage() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);
  const [poll, setPoll] = useState<Poll | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [voted, setVoted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (getVoterToken(id)) { setVoted(true); setLoading(false); return; }
      const [{ data: p }, { data: o }] = await Promise.all([
        supabase.from('polls').select('id, question, vote_mode').eq('id', id).single(),
        supabase.from('poll_options').select('id, label, sort_order').eq('poll_id', id).order('sort_order'),
      ]);
      setPoll(p as Poll);
      setOptions((o as Option[]) ?? []);
      setLoading(false);
    })();
  }, [id, supabase]);

  const toggle = (optId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (poll?.vote_mode === 'single') { next.clear(); next.add(optId); }
      else if (next.has(optId)) next.delete(optId);
      else next.add(optId);
      return next;
    });
  };

  const submit = async () => {
    if (!selected.size) return;
    const token = crypto.randomUUID();
    await supabase.from('poll_votes').insert([...selected].map(option_id => ({ poll_id: id, option_id, voter_token: token })));
    setVoterToken(id, token);
    setVoted(true);
  };

  if (loading) return <div className="p-6" style={{ color: '#909296' }}>Loading...</div>;

  if (voted) return (
    <div className="p-6 max-w-xl mx-auto text-center">
      <p className="text-lg font-semibold mb-4" style={{ color: '#F8F9FA' }}>Thanks for voting!</p>
      <a href={`/polls/${id}/results`} className="text-sm" style={{ color: '#facc15' }}>View Results →</a>
    </div>
  );

  if (!poll) return <div className="p-6" style={{ color: '#909296' }}>Poll not found.</div>;

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-xl font-bold mb-1" style={{ color: '#F8F9FA' }}>{poll.question}</h1>
      <p className="text-xs mb-6" style={{ color: '#909296' }}>{poll.vote_mode === 'approval' ? 'Select all that apply' : 'Select one'}</p>

      <div className="flex flex-col gap-2 mb-6">
        {options.map(o => (
          <button key={o.id} onClick={() => toggle(o.id)} className="text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors" style={selected.has(o.id)
            ? { background: '#facc15', color: '#0a0a0a' }
            : { background: '#1A1B1E', border: '1px solid #373A40', color: '#F8F9FA' }}>
            {o.label}
          </button>
        ))}
      </div>

      <button onClick={submit} disabled={!selected.size} className="px-4 py-2 rounded font-semibold text-sm disabled:opacity-40" style={{ background: '#facc15', color: '#0a0a0a' }}>
        Submit Vote
      </button>
    </div>
  );
}
