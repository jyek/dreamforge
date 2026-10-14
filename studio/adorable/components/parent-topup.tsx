"use client";
import { useState } from "react";
import { TOPUP_PACKAGES } from "@/lib/topup-packages";
import { DreamForgeBrand } from "./dreamforge-brand";
export function ParentTopup({
  token,
  enabled,
  paid,
}: {
  token: string;
  enabled: boolean;
  paid: boolean;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  async function pay(id: string) {
    setBusy(id);
    try {
      const r = await fetch("/api/platform/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, package: id }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      window.location.assign(data.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy("");
    }
  }
  return (
    <main className="df-page">
      <header className="df-header">
        <DreamForgeBrand />
      </header>
      <section className="df-pay">
        <p className="df-eyebrow">For parents & guardians</p>
        <h1 className="df-title">Fuel their next big idea.</h1>
        <p className="df-muted">
          Add a token allowance to your child’s DreamForge account. This is a
          one-time purchase, with no subscription or automatic renewal.
        </p>
        {paid && (
          <p className="df-notice">
            If your payment completed, tokens will appear once Stripe confirms
            it. This page alone does not confirm a payment.
          </p>
        )}
        {!enabled && (
          <p className="df-notice">
            These are proposed pilot packages. Payments are not enabled yet.
          </p>
        )}
        {error && (
          <p className="df-error" role="alert">
            {error}
          </p>
        )}
        <div className="df-stats">
          {TOPUP_PACKAGES.map((p) => (
            <article key={p.id} className="df-card df-stat">
              <span className="df-pill">{p.name}</span>
              <strong>S${p.amount / 100}</strong>
              <p>{(p.tokens / 1000000).toLocaleString()} million tokens</p>
              <button
                className="df-button"
                disabled={!enabled || !!busy}
                onClick={() => pay(p.id)}
              >
                {busy === p.id ? "Opening Stripe…" : "Add tokens →"}
              </button>
            </article>
          ))}
        </div>
        <div className="df-card">
          <h2 style={{ marginTop: 0 }}>What counts as a token?</h2>
          <p className="df-muted">
            AI reads prompts, project files and previous messages, then writes
            replies and code. All input and output tokens count toward the
            allowance, including requests using free models. Bigger projects can
            use more tokens per change.
          </p>
          <p className="df-muted">
            You’ll pay securely through Stripe. DreamForge credits the child’s
            account only after confirmed payment. This link does not provide
            access to the child’s projects or conversations.
          </p>
        </div>
      </section>
    </main>
  );
}
