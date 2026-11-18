'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import Logo from './Logo';
import StockSearch from './StockSearch';

const links = [
  { href: '/', label: 'Home' },
  { href: '/board', label: 'Liquidity Board' },
  { href: '/plans', label: 'Trade Plans' },
  { href: '/chart', label: 'Order Block Charts' },
  { href: '/xray', label: 'Market X-Ray' },
  { href: '/methodology', label: 'Methodology' }
];

export default function Navbar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (h: string) => h === '/' ? path === '/' : path.startsWith(h.split('/').slice(0, 2).join('/'));
  return (
    <header className="nav">
      <div className="container nav-in">
        <Link href="/" className="logo" aria-label="Stoclio home"><Logo /> <span>Stoc<span className="grad">lio</span></span></Link>
        <nav id="primary-navigation" aria-label="Primary navigation" className={`nav-links ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
          {links.map(l => <Link key={l.href} href={l.href} className={isActive(l.href) ? 'active' : ''}>{l.label}</Link>)}
        </nav>
        <StockSearch className="nav-stock-search" onNavigate={() => setOpen(false)} />
        <button className="burger" aria-label="Menu" aria-expanded={open} aria-controls="primary-navigation" onClick={() => setOpen(o => !o)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
      </div>
    </header>
  );
}
