"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

type InviteInfo = { email: string | null; role: string; type: "EMAIL" | "LINK"; workspaceName: string; inviterName: string };

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const token = params.token as string;

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    fetch(`/api/invites/${token}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) setError(data.error);
        else setInvite(data);
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function accept() {
    setAccepting(true);
    setError("");
    const res = await fetch(`/api/invites/${token}/accept`, { method: "POST" });
    const data = await res.json();
    setAccepting(false);
    if (!res.ok) {
      setError(data.error);
      return;
    }
    router.push(`/workspace/${data.workspaceId}`);
  }

  if (loading) return <main className="min-h-screen flex items-center justify-center text-sm text-muted">Loading…</main>;

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo" />
          <span className="font-display font-semibold tracking-tight">CollabSpace</span>
        </div>

        <div className="bg-white border border-line rounded-lg shadow-card p-7 text-center">
          {error ? (
            <>
              <p className="text-sm text-coral mb-4">{error}</p>
              <Link href="/dashboard" className="text-sm text-indigo font-medium">
                Go to dashboard
              </Link>
            </>
          ) : invite ? (
            <>
              <h1 className="text-lg font-display font-semibold mb-1">
                Join {invite.workspaceName}
              </h1>
              <p className="text-sm text-muted mb-6">
                {invite.type === "LINK" ? (
                  <>
                    {invite.inviterName} shared a link to join as a{invite.role === "ADMIN" ? "n" : ""}{" "}
                    {invite.role.toLowerCase()}.
                  </>
                ) : (
                  <>
                    {invite.inviterName} invited <span className="font-medium">{invite.email}</span> as
                    a{invite.role === "ADMIN" ? "n" : ""} {invite.role.toLowerCase()}.
                  </>
                )}
              </p>

              {status === "unauthenticated" ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted mb-2">
                    {invite.type === "LINK"
                      ? "Log in or sign up to accept."
                      : `Log in or sign up with ${invite.email} to accept.`}
                  </p>
                  <Link
                    href={`/login?invite=${token}`}
                    className="block w-full bg-indigo text-white rounded-md py-2.5 text-sm font-medium"
                  >
                    Log in
                  </Link>
                  <Link
                    href={`/signup?invite=${token}`}
                    className="block w-full border border-line rounded-md py-2.5 text-sm font-medium"
                  >
                    Sign up
                  </Link>
                </div>
              ) : (
                <button
                  onClick={accept}
                  disabled={accepting}
                  className="w-full bg-indigo text-white rounded-md py-2.5 text-sm font-medium disabled:opacity-50"
                >
                  {accepting ? "Joining…" : "Accept invite"}
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
