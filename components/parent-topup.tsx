"use client";
import { InlineSpinner } from "./dream-loading";
import { useEffect, useState } from "react";
import { TOPUP_PACKAGES } from "@/lib/topup-packages";
import { DreamForgeBrand } from "./dreamforge-brand";
export function ParentTopup({
  token,
  enabled,
  paid,
  sessionId,
  sandbox = false,
}: {
  token: string;
  enabled: boolean;
  paid: boolean;
  sessionId?: string;
  sandbox?: boolean;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  const [credit, setCredit] = useState<number | null>(null);
  useEffect(() => {
    if (!paid || !sessionId) return;
    let stopped = false;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    async function poll() {
      try {
        const r = await fetch(
          `/api/platform/payment-status?${new URLSearchParams({ token, session: sessionId! })}`,
          { signal: controller.signal },
        );
        const data = await r.json();
        if (r.ok && data.credited && !stopped) {
          setCredit(data.tokens);
          return;
        }
      } catch {}
      if (!stopped && ++attempts < 30) timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [paid, sessionId, token]);
  async function pay(id: string) {
    setError("");
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
        {sandbox && (
          <p className="df-notice">
            <strong>Sandbox payments</strong> · No real money is charged. Use
            test card 4242 4242 4242 4242, any future expiry date and any
            three-digit CVC.
          </p>
        )}
        {paid && (
          <p className="df-notice">
            {credit !== null
              ? `${credit.toLocaleString()} tokens added to the account. You can return to DreamForge and keep building.`
              : "Waiting for Stripe to confirm your payment and add tokens. If this takes a moment, refresh this page shortly."}
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
                {busy === p.id && <InlineSpinner className="size-4" />}
                {busy === p.id
                  ? "Opening Stripe…"
                  : sandbox
                    ? "Test top-up →"
                    : "Add tokens →"}
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
