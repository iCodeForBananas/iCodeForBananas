"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Bento } from "@/app/components/ui/bento";
import { Heading } from "@radix-ui/themes";
import { track } from "@/app/lib/analytics";

const MIN_PASSWORD_LENGTH = 8;

export default function RegisterForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const getSupabase = () => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  };

  const returnTo = searchParams.get("returnTo");
  const safeReturnTo = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : null;

  useEffect(() => {
    track("register_view");
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    track("register_submit");
    const sb = getSupabase();
    if (!sb) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    const next = safeReturnTo ?? "/workout-tracker";
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      track("register_failed", { reason: error.message });
      setError(error.message);
      setLoading(false);
      return;
    }
    track("sign_up", { method: "password" });
    if (!data.session) {
      // Email confirmation is on: the account exists but isn't signed in yet.
      setCheckEmail(true);
      setLoading(false);
      return;
    }
    if (safeReturnTo) {
      window.location.href = safeReturnTo;
    } else {
      router.push("/workout-tracker");
      router.refresh();
    }
  };

  const loginHref = safeReturnTo ? `/login?returnTo=${encodeURIComponent(safeReturnTo)}` : "/login";

  if (checkEmail) {
    return (
      <div className='flex items-center justify-center min-h-screen p-4'>
        <Bento size='4' className='w-full max-w-sm'>
          <Heading as='h1' size='6' mb='3'>
            Check your email
          </Heading>
          <p className='text-14 text-ink-muted'>
            We sent a confirmation link to <strong className='text-ink-primary'>{email}</strong>. Open it to finish
            creating your account.
          </p>
          <p className='mt-5 text-13 text-ink-muted'>
            Already confirmed?{" "}
            <Link href={loginHref} className='underline hover:text-ink-primary'>
              Sign in
            </Link>
          </p>
        </Bento>
      </div>
    );
  }

  return (
    <div className='flex items-center justify-center min-h-screen p-4'>
      <Bento size='4' className='w-full max-w-sm'>
        <Heading as='h1' size='6' mb='5'>
          Create Account
        </Heading>
        <form onSubmit={handleRegister} className='space-y-4'>
          {error && (
            <p role='alert' className='text-center text-13 text-danger'>
              {error}
            </p>
          )}
          <Input
            type='email'
            placeholder='Email'
            autoComplete='email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            size='3'
          />
          <Input
            type='password'
            placeholder='Password'
            autoComplete='new-password'
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            size='3'
          />
          <Input
            type='password'
            placeholder='Confirm password'
            autoComplete='new-password'
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            size='3'
          />
          <Button type='submit' variant='primary' size='lg' disabled={loading} className='w-full'>
            {loading ? "Creating account…" : "Create Account"}
          </Button>
        </form>
        <p className='mt-5 text-center text-13 text-ink-muted'>
          Already have an account?{" "}
          <Link href={loginHref} className='underline hover:text-ink-primary'>
            Sign in
          </Link>
        </p>
      </Bento>
    </div>
  );
}
