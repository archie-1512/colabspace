"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Incorrect email or password.");
      return;
    }
    router.push(inviteToken ? `/invite/${inviteToken}` : "/dashboard");
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center gap-2 mb-8 justify-center">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo" />
          <span className="font-display font-semibold tracking-tight">CollabSpace</span>
        </Link>

        <div className="bg-white border border-line rounded-lg shadow-card p-8">
          <h1 className="text-xl font-display font-semibold mb-1">Welcome back</h1>
          <p className="text-sm text-muted mb-6">Log in to continue to your workspaces.</p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-mono uppercase tracking-wider text-muted">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full border border-line rounded-md px-3 py-2.5 text-sm bg-paper mt-1.5"
              />
            </div>
            <div>
              <label className="text-xs font-mono uppercase tracking-wider text-muted">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full border border-line rounded-md px-3 py-2.5 text-sm bg-paper mt-1.5"
              />
            </div>
            {error && <p className="text-sm text-coral">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo text-white rounded-md py-2.5 text-sm font-medium disabled:opacity-50 mt-1"
            >
              {loading ? "Logging in…" : "Log in"}
            </button>
          </form>
        </div>

        <p className="text-sm text-muted mt-5 text-center">
          Don't have an account?{" "}
          <Link href={inviteToken ? `/signup?invite=${inviteToken}` : "/signup"} className="text-indigo font-medium">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
