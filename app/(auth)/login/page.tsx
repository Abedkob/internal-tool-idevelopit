"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export default function LoginPage() {
  const router = useRouter();
  const configured = hasSupabaseConfig();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) return;
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="login-page">
      <section className="login-context" aria-label="Team Console introduction">
        <div className="login-brand">
          <span className="brand-mark">TC</span> Team Console
        </div>
        <div className="login-copy">
          <p className="eyebrow">Private workspace</p>
          <h1>
            Keep the work
            <br />
            within reach.
          </h1>
          <p>
            Pipeline, client touchpoints, tasks, and spending—organized for a
            team of three.
          </p>
        </div>
        <p className="login-footnote">One shared source of truth.</p>
      </section>

      <section className="login-panel">
        <form className="login-form" onSubmit={signIn}>
          <div className="login-lock" aria-hidden="true">
            <LockKeyhole size={21} />
          </div>
          <p className="eyebrow">Team access</p>
          <h2>Sign in</h2>
          <p className="form-intro">
            Use the email and password connected to your workspace.
          </p>

          {!configured && (
            <div className="notice" role="status">
              Add your Supabase URL and anon key to <code>.env.local</code> to
              enable sign-in.
            </div>
          )}

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@team.com"
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button button-primary button-full"
            type="submit"
            disabled={loading || !configured}
          >
            {loading ? "Signing in…" : "Enter workspace"}
            <ArrowRight size={16} />
          </button>
        </form>
      </section>
    </main>
  );
}
