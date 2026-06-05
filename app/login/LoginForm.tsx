"use client";

import { useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import BentoPageLayout from "@/app/components/BentoPageLayout";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const getSupabase = () => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const sb = getSupabase();
    if (!sb) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const returnTo = searchParams.get("returnTo");
    if (returnTo && returnTo.startsWith("/")) {
      window.location.href = returnTo;
    } else {
      router.push("/workout-tracker");
      router.refresh();
    }
  };

  return (
    <BentoPageLayout title='Sign In' maxWidth='max-w-sm'>
      <form onSubmit={handleLogin} className='w-full space-y-4 py-8'>
        {error && <p className='text-red-500 text-sm text-center'>{error}</p>}
        <input
          type='email'
          placeholder='Email'
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className='w-full border border-[#373A40]/30 rounded px-3 py-2 text-sm'
        />
        <input
          type='password'
          placeholder='Password'
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className='w-full border border-[#373A40]/30 rounded px-3 py-2 text-sm'
        />
        <button
          type='submit'
          disabled={loading}
          className='w-full rounded bg-black px-5 py-2 text-sm font-medium text-[#facc15] hover:bg-black/80 disabled:opacity-50'
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </BentoPageLayout>
  );
}
