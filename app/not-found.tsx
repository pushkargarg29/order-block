import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="container" style={{ padding: '120px 20px', textAlign: 'center' }}>
      <h1 style={{ fontSize: 64, fontWeight: 850 }} className="grad">404</h1>
      <p className="muted" style={{ margin: '12px 0 28px' }}>This page doesn&apos;t exist.</p>
      <Link href="/" className="btn btn-primary">Back to home</Link>
    </div>
  );
}
