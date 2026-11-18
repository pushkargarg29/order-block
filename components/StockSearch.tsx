'use client';
import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Timeframe } from '@/lib/types';

type Stock = { symbol: string; name: string };

export default function StockSearch({ className = '', onNavigate, timeframe, placeholder = 'Search active NSE F&O stocks...', label = 'Search active NSE futures and options stocks' }: {
  className?: string;
  onNavigate?: () => void;
  timeframe?: Timeframe;
  placeholder?: string;
  label?: string;
}) {
  const router = useRouter();
  const inputId = useId();
  const resultsId = useId();
  const [query, setQuery] = useState('');
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const request = useRef<Promise<void> | null>(null);

  const loadStocks = () => {
    if (stocks.length || request.current) return;
    setLoading(true);
    setError('');
    request.current = fetch('/api/universe')
      .then(async response => {
        if (!response.ok) throw new Error('Could not load the stock list.');
        const data = await response.json() as { symbols?: Stock[] };
        if (!Array.isArray(data.symbols)) throw new Error('The stock list response was invalid.');
        setStocks(data.symbols);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Could not load the stock list.');
      })
      .finally(() => {
        setLoading(false);
        request.current = null;
      });
  };

  const matches = query.trim()
    ? stocks.filter(stock => `${stock.symbol} ${stock.name}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];

  const openStock = (symbol: string) => {
    setOpen(false);
    onNavigate?.();
    const tf = timeframe ? `?tf=${timeframe}` : '';
    router.push(`/chart/${encodeURIComponent(symbol)}${tf}`);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (matches[0]) openStock(matches[0].symbol);
  };

  return (
    <div className={`stock-search ${className}`}>
      <form className="stock-search-form" role="search" onSubmit={submit}>
        <label className="sr-only" htmlFor={inputId}>{label}</label>
        <input
          id={inputId}
          className="input"
          type="search"
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && matches.length > 0}
          aria-controls={resultsId}
          value={query}
          onFocus={() => { setOpen(true); loadStocks(); }}
          onChange={event => {
            setQuery(event.target.value);
            setOpen(true);
            loadStocks();
          }}
          onKeyDown={event => {
            if (event.key === 'Escape') setOpen(false);
          }}
        />
        <button className="btn btn-primary" type="submit" disabled={!matches.length} aria-label="Open the matching stock chart">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
        </button>
      </form>
      {open && query.trim() && (loading || error || matches.length > 0 || stocks.length > 0) && (
        <div className="stock-search-results">
          {loading && <p className="stock-search-message" role="status">Loading stock symbols...</p>}
          {error && <p className="stock-search-message err" role="alert">{error}</p>}
          {!loading && !error && matches.length > 0 && (
            <ul id={resultsId} role="listbox" aria-label="Matching stocks">
              {matches.map(stock => (
                <li key={stock.symbol} role="option" aria-selected="false">
                  <button type="button" onClick={() => openStock(stock.symbol)}>
                    <strong>{stock.symbol}</strong><span>{stock.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loading && !error && stocks.length > 0 && !matches.length && (
            <p className="stock-search-message">No matching symbol was found among active NSE F&amp;O stocks.</p>
          )}
        </div>
      )}
      <p className="stock-search-hint">Search by symbol or company name · Active NSE futures and options stocks</p>
    </div>
  );
}
