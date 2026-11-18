'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

export default function TermsAcceptanceGate({ children }: { children: ReactNode }) {
  const [accepted, setAccepted] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  if (accepted) return children;

  return (
    <div className="terms-gate">
      <section className="terms-dialog card glass" role="dialog" aria-modal="true" aria-labelledby="terms-title">
        <h1 id="terms-title">Terms &amp; risk notice</h1>
        <p>
          Stoclio provides educational market analytics, not investment advice. Analysis and trade plans may be inaccurate
          or delayed, and trading futures and options involves substantial risk.
        </p>
        <label className="terms-agreement">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={event => setAcknowledged(event.target.checked)}
          />
          <span>I have read and understand this notice and agree to use Stoclio at my own risk.</span>
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!acknowledged}
          onClick={() => setAccepted(true)}
        >
          Accept and enter
        </button>
      </section>
    </div>
  );
}
