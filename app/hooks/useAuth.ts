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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  const signOut = () => { const sb = createClient(); return sb ? sb.auth.signOut() : Promise.resolve({ error: null }); };

  return { user, loading, signOut };
}
