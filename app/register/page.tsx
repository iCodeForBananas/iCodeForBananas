export const dynamic = 'force-dynamic';

import type { Metadata } from "next";
import RegisterForm from './RegisterForm';

export const metadata: Metadata = {
  title: "Create Account",
  description: "Create an iCodeForBananas account to save your songs, workouts, trading strategies, and progress across devices.",
  keywords: ["sign up", "register", "create account", "iCodeForBananas", "account"],
  openGraph: {
    title: "Create Account",
    description: "Create an account to save your iCodeForBananas tools and data.",
    type: "website",
  },
};

export default function RegisterPage() {
  return <RegisterForm />;
}
