'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

interface Option { id: string; label: string; sort_order: number }
interface Poll { id: string; question: string; vote_mode: string }
interface Vote { option_id: string }

export default function PollResultsPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);
  const [poll, setPoll] = useState<Poll | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: o }, { data: v }] = await Promise.all([
        supabase.from('polls').select('id, question, vote_mode').eq('id', id).single(),
        supabase.from('poll_options').select('id, label, sort_order').eq('poll_id', id).order('sort_order'),
        supabase.from('poll_votes').select('option_id').eq('poll_id', id),
      ]);
      setPoll(p as Poll);
      setOptions((o as Option[]) ?? []);
      setVotes((v as Vote[]) ?? []);
      setLoading(false);
    })();
  }, [id, supabase]);

  if (loading) return <div className="p-6" style={{ color: '#909296' }}>Loading...</div>;
  if (!poll) return <div className="p-6" style={{ color: '#909296' }}>Poll not found.</div>;

  const counts = new Map<string, number>();
  for (const v of votes) counts.set(v.option_id, (counts.get(v.option_id) ?? 0) + 1);
  const max = Math.max(1, ...counts.values());
  const totalVoters = new Set(votes.map(() => '?')).size; // approximate from votes
  const totalVotes = votes.length;

  return (
    <div className="p-6 max-w-xl mx-auto">
      <a href="/polls" className="text-sm mb-4 inline-block" style={{ color: '#facc15' }}>← Back</a>
      <h1 className="text-xl font-bold mb-1" style={{ color: '#F8F9FA' }}>{poll.question}</h1>
      <p className="text-xs mb-6" style={{ color: '#909296' }}>{totalVotes} vote{totalVotes !== 1 ? 's' : ''} · {poll.vote_mode === 'approval' ? 'Approval voting' : 'Single vote'}</p>

      <div className="flex flex-col gap-3">
        {options.map(o => {
          const c = counts.get(o.id) ?? 0;
          const pct = totalVotes ? Math.round((c / max) * 100) : 0;
          return (
            <div key={o.id}>
              <div className="flex justify-between text-sm mb-1">
                <span style={{ color: '#F8F9FA' }}>{o.label}</span>
                <span style={{ color: '#909296' }}>{c}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: '#373A40' }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#facc15', transition: 'width 0.3s' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
