"use client";
import { InlineSpinner } from "./dream-loading";
import { useEffect, useState } from "react";
import {
  CREDIT_TOPUPS,
  formatCredit,
  formatCreditBalance,
} from "@/lib/billing";
import { TOPUP_PACKAGES } from "@/lib/topup-packages";
import { notifyBalanceChanged } from "@/lib/balance-refresh";
import Link from "next/link";
import { DreamForgeBrand } from "./dreamforge-brand";
export function ParentTopup({
  token,
  enabled,
  paid,
  sessionId,
  sandbox = false,
  prepaid = false,
}: {
  token: string;
  enabled: boolean;
  paid: boolean;
  sessionId?: string;
  sandbox?: boolean;
  prepaid?: boolean;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  const [credit, setCredit] = useState<{
    creditAddedMicros?: number | null;
    availableCreditMicros?: number;
    prepaid?: boolean;
    tokens: number;
    remaining: number;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [checkVersion, setCheckVersion] = useState(0);
  useEffect(() => {
    if (!paid || !sessionId) return;
    setCredit(null);
    setChecking(true);
    setPaymentError("");
    let stopped = false;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    async function poll() {
      try {
        const r = await fetch("/api/platform/payment-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, session: sessionId }),
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        });
        const data = await r.json();
        if (r.ok && data.credited && !stopped) {
          setCredit({
            tokens: data.tokens,
            remaining: data.remaining,
            prepaid: data.prepaid,
            creditAddedMicros: data.creditAddedMicros,
            availableCreditMicros: data.availableCreditMicros,
          });
          setChecking(false);
          notifyBalanceChanged();
          return;
        }
        if (!r.ok && r.status < 500) {
          if (!stopped) {
            setPaymentError(data.error || "We couldn’t confirm this payment.");
            setChecking(false);
          }
          return;
        }
      } catch {}
      if (stopped) return;
      if (++attempts < 15) timer = setTimeout(poll, 2000);
      else {
        setChecking(false);
        setPaymentError(
          "Payment confirmation is taking longer than expected. Check again below. You don’t need to pay again.",
        );
      }
    }
    void poll();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [paid, sessionId, token, checkVersion]);
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
      <section className={`df-pay ${prepaid ? "df-pay--prepaid" : ""}`}>
        <p className="df-eyebrow">For parents & guardians</p>
        <h1 className="df-title">Fuel their next big idea.</h1>
        <p className="df-muted">
          {prepaid
            ? "Add credit so your child can keep creating with AI in DreamForge."
            : "Add a token allowance to your child’s DreamForge account."}
        </p>
        {(sandbox || paid) && (
          <div className="df-payment-notices">
            {sandbox && (
              <p className="df-notice df-payment-sandbox">
                <strong>Sandbox payments</strong> · No real money is charged.
                Use test card 4242 4242 4242 4242, any future expiry date and
                any three-digit CVC.
              </p>
            )}
            {paid && (
              <div
                className={`df-notice df-payment-status ${credit !== null ? "is-success" : paymentError ? "is-error" : "is-pending"}`}
                role="status"
                aria-live="polite"
              >
                {credit !== null ? (
                  <>
                    <strong>
                      {credit.prepaid
                        ? credit.creditAddedMicros == null
                          ? "This earlier token purchase was already credited. Your current prepaid balance is shown below."
                          : `${formatCredit(credit.creditAddedMicros)} added to the account.`
                        : `${credit.tokens.toLocaleString()} tokens added to the account.`}
                    </strong>
                    <p>
                      New available balance:{" "}
                      <strong>
                        {credit.prepaid
                          ? formatCreditBalance(
                              credit.availableCreditMicros || 0,
                            )
                          : `${credit.remaining.toLocaleString()} tokens`}
                      </strong>
                      .
                    </p>
                    <Link className="df-button" href="/profile">
                      Return to DreamForge →
                    </Link>
                  </>
                ) : (
                  <>
                    <p>
                      {paymentError ||
                        "Confirming your payment and adding tokens…"}
                    </p>
                    {checking ? (
                      <InlineSpinner className="size-4" />
                    ) : (
                      <button
                        className="df-button"
                        onClick={() => setCheckVersion((n) => n + 1)}
                      >
                        Check payment again
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
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
        {!(paid && credit === null) && (
          <div className="df-stats">
            {(prepaid
              ? CREDIT_TOPUPS.map((p) => ({ ...p, tokens: 0 }))
              : TOPUP_PACKAGES
            ).map((p) => (
              <article key={p.id} className="df-card df-stat">
                <span className="df-pill">One-time top up</span>
                <strong>S${p.amount / 100}</strong>
                {!prepaid && (
                  <p>{(p.tokens / 1000000).toLocaleString()} million tokens</p>
                )}
                <button
                  className="df-button"
                  disabled={!enabled || !!busy}
                  onClick={() => pay(p.id)}
                >
                  {busy === p.id && <InlineSpinner className="size-4" />}
                  {busy === p.id ? "Opening Stripe…" : "Top up"}
                </button>
              </article>
            ))}
          </div>
        )}
        <div className="df-card">
          <h2 style={{ marginTop: 0 }}>
            {prepaid ? "How your balance is used" : "What counts as a token?"}
          </h2>
          <p className="df-muted">
            {prepaid
              ? "Your child uses credit when they ask AI to help build or change a project. The cost depends on the AI they choose and how much work it does. Prices are shown beside each AI option."
              : "Tokens measure how much the AI reads and writes while helping your child. Longer conversations and bigger projects can use more tokens."}
          </p>
          {prepaid && (
            <p className="df-muted">
              We set aside some credit while the AI works. When it finishes,
              only the amount used is charged. The rest stays available.
            </p>
          )}
          <p className="df-muted">
            You pay securely through Stripe. Credit is added after payment is
            confirmed. This payment link lets you top up without giving access
            to your child’s projects or conversations.
          </p>
        </div>
      </section>
    </main>
  );
}
