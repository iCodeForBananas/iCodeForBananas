export const dynamic = 'force-dynamic';

import type { Metadata } from "next";
import LoginForm from './LoginForm';

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your iCodeForBananas account to access music theory tools, trading dashboards, fitness tracker, lead sheet editor, and more.",
  keywords: ["sign in", "login", "iCodeForBananas", "account"],
  openGraph: {
    title: "Sign In",
    description: "Sign in to access your iCodeForBananas tools and saved data.",
    type: "website",
  },
};

export default function LoginPage() {
  return <LoginForm />;
}
