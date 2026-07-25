'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { User } from '@supabase/supabase-js';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getUser()
      .then(({ data }) => { setUser(data.user); setLoading(false); })
      .catch(() => {
        // getUser() throws when offline — fall back to the locally-stored session
        // so that previously-authenticated users can still access the app.
        supabase.auth.getSession().then(({ data: sd }) => {
          setUser(sd.session?.user ?? null);
          setLoading(false);
        });
      });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      // Supabase re-emits auth state (with a fresh user object) on tab focus,
      // e.g. for token refresh. Keep referential stability when the identity
      // hasn't changed so consumers keyed on `user` in a dep array don't refetch.
      setUser((prev) => {
        const next = session?.user ?? null;
        return prev?.id === next?.id ? prev : next;
      });
    });
    return () => subscription.unsubscribe();
  }, []);

  const signOut = () => { const sb = createClient(); return sb ? sb.auth.signOut() : Promise.resolve({ error: null }); };

  return { user, loading, signOut };
}
