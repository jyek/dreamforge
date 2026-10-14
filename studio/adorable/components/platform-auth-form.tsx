"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { DreamForgeBrand, DreamForgeArt } from "./dreamforge-brand";
export function PlatformAuthForm({
  signup = false,
  teacherInvite = "",
}: {
  signup?: boolean;
  teacherInvite?: string;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const response = await fetch("/api/platform/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...Object.fromEntries(form),
          action: signup ? "signup" : "login",
          teacherInvite,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      window.location.assign("/home");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="df-page df-auth-page">
      <header className="df-header">
        <DreamForgeBrand />
        <nav className="df-nav">
          <Link href="/examples">Explore examples ↗</Link>
        </nav>
      </header>
      <section className="df-auth">
        <div className="df-auth-copy">
          <p className="df-eyebrow">Your imagination is the starting point</p>
          <h1 className="df-title">
            Dream it.
            <br />
            <span className="df-highlight">Build it.</span>
            <br />
            Make it yours.
          </h1>
          <p className="df-muted">
            Turn your big ideas into little games, brilliant apps, and things
            that make you smile.
          </p>
          <DreamForgeArt />
        </div>
        <div className="df-card df-auth-card">
          <span className="df-pill">
            {teacherInvite
              ? "Teacher invitation"
              : signup
                ? "Let’s make something"
                : "Your creative corner"}
          </span>
          <h2 style={{ fontSize: 28, margin: "20px 0 8px" }}>
            {signup
              ? teacherInvite
                ? "Welcome, teacher!"
                : "Hello, builder!"
              : "Welcome back!"}
          </h2>
          <p className="df-muted" style={{ fontSize: 14, marginBottom: 25 }}>
            {signup
              ? teacherInvite
                ? "Create your account to start a class."
                : "Start building today. You can join a class now or later."
              : "Your next big idea is waiting for you."}
          </p>
          <form className="df-form" onSubmit={submit}>
            {signup ? (
              <>
                <label>
                  Your name
                  <input
                    className="df-input"
                    name="name"
                    maxLength={60}
                    required
                    autoComplete="nickname"
                    placeholder={teacherInvite ? "e.g. Ms Tan" : "e.g. Alex"}
                  />
                </label>
                <label>
                  Choose a username
                  <input
                    className="df-input"
                    name="username"
                    required
                    pattern="[a-zA-Z0-9_]{3,30}"
                    autoComplete="username"
                    placeholder="3–30 letters, numbers or underscores"
                  />
                </label>
                <label>
                  Email {teacherInvite ? "" : "(optional)"}
                  <input
                    className="df-input"
                    name="email"
                    type="email"
                    required={!!teacherInvite}
                    autoComplete="email"
                    placeholder={
                      teacherInvite
                        ? "you@example.com"
                        : "You can sign in with just your username"
                    }
                  />
                </label>
                {!teacherInvite && (
                  <label>
                    Class Number (optional)
                    <input
                      className="df-input"
                      name="classCode"
                      maxLength={30}
                      autoComplete="off"
                      placeholder="Enter a Class Number, or join later"
                    />
                  </label>
                )}
              </>
            ) : (
              <label>
                Username or email
                <input
                  className="df-input"
                  name="login"
                  required
                  autoComplete="username"
                  placeholder="Your username or email"
                />
              </label>
            )}
            <label>
              Password
              <input
                className="df-input"
                name="password"
                type="password"
                minLength={8}
                maxLength={128}
                required
                autoComplete={signup ? "new-password" : "current-password"}
                placeholder="At least 8 characters"
              />
            </label>
            {error && (
              <p role="alert" className="df-error">
                {error}
              </p>
            )}
            <button className="df-button" disabled={busy}>
              {busy
                ? "Opening your creative corner…"
                : signup
                  ? "Create account →"
                  : "Let’s go →"}
            </button>
          </form>
          <p
            className="df-muted"
            style={{ fontSize: 13, textAlign: "center", marginTop: 24 }}
          >
            {signup ? "Already a builder? " : "New here? "}
            <Link className="df-purple" href={signup ? "/login" : "/signup"}>
              {signup ? "Sign in" : "Create an account"}
            </Link>
          </p>
          {!signup && (
            <p
              style={{ fontSize: 11, textAlign: "center" }}
              className="df-muted"
            >
              Teacher accounts are available by invitation.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
