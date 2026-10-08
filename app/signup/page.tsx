"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Something went wrong. Please try again.");
      setLoading(false);
      return;
    }
    const signInRes = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (signInRes?.error) {
      setError("Account created, but automatic login failed. Please log in manually.");
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
          <h1 className="text-xl font-display font-semibold mb-1">Create an account</h1>
          <p className="text-sm text-muted mb-6">Get started in under a minute.</p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-mono uppercase tracking-wider text-muted">Full name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full border border-line rounded-md px-3 py-2.5 text-sm bg-paper mt-1.5"
              />
            </div>
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
                minLength={6}
                className="w-full border border-line rounded-md px-3 py-2.5 text-sm bg-paper mt-1.5"
              />
              <p className="text-xs text-muted mt-1">Minimum 6 characters.</p>
            </div>
            {error && <p className="text-sm text-coral">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo text-white rounded-md py-2.5 text-sm font-medium disabled:opacity-50 mt-1"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>
        </div>

        <p className="text-sm text-muted mt-5 text-center">
          Already have an account?{" "}
          <Link href={inviteToken ? `/login?invite=${inviteToken}` : "/login"} className="text-indigo font-medium">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
