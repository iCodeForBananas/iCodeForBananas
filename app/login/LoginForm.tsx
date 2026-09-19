"use client";

import { useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Bento } from "@/app/components/ui/bento";
import { Heading } from "@radix-ui/themes";

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
    <div className='flex items-center justify-center min-h-screen p-4'>
      <Bento size='4' className='w-full max-w-sm'>
        <Heading as='h1' size='6' mb='5'>
          Sign In
        </Heading>
        <form onSubmit={handleLogin} className='space-y-4'>
          {error && (
            <p role='alert' className='text-center text-13 text-danger'>
              {error}
            </p>
          )}
          <Input
            type='email'
            placeholder='Email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            size='3'
          />
          <Input
            type='password'
            placeholder='Password'
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            size='3'
          />
          <Button type='submit' variant='primary' size='lg' disabled={loading} className='w-full'>
            {loading ? "Signing in…" : "Sign In"}
          </Button>
        </form>
      </Bento>
    </div>
  );
}
