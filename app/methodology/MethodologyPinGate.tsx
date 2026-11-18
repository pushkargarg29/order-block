'use client';
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

export default function MethodologyPinGate({ children }: { children: ReactNode }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/methodology-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
        cache: 'no-store'
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not verify the PIN.');
      setPin('');
      setUnlocked(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not verify the PIN.');
    } finally {
      setBusy(false);
    }
  };

  if (unlocked) return children;

  return (
    <main className="methodology-pin-gate">
      <section className="card glass" style={{ padding: 'var(--card-padding)' }}>
        <h1>Methodology</h1>
        <p className="muted" style={{ margin: '10px 0 20px' }}>Enter the access PIN shared by Stoclio.</p>
        <form onSubmit={submit}>
          <label htmlFor="methodology-pin" className="muted">Access PIN</label>
          <input
            id="methodology-pin"
            className="input"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{4}"
            maxLength={4}
            required
            value={pin}
            onChange={event => {
              setPin(event.target.value.replace(/\D/g, '').slice(0, 4));
              setError(null);
            }}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? 'methodology-pin-error' : undefined}
            style={{ display: 'block', width: '100%', margin: '8px 0 14px' }}
          />
          {error && (
            <p id="methodology-pin-error" className="pin-error" role="alert">
              <span className="pin-error-icon" aria-hidden="true">!</span>
              <span>{error === 'Incorrect PIN.' ? 'Incorrect PIN. Check the code and try again.' : error}</span>
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy || pin.length !== 4}>
            {busy ? 'Checking…' : 'Unlock methodology'}
          </button>
        </form>
      </section>
    </main>
  );
}
