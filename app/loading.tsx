export default function Loading() {
  return (
    <div className="container" aria-busy="true" aria-live="polite">
      <div className="page-head"><div style={{ width: '100%' }}><div className="skeleton" style={{ height: 40, width: 'min(420px,80%)' }} /><div className="skeleton" style={{ height: 18, width: 'min(620px,95%)', marginTop: 12 }} /></div></div>
      <div className="skeleton" style={{ height: 88, marginBottom: 20 }} />
      <div className="skeleton" style={{ height: 'min(480px,60vh)' }} />
    </div>
  );
}
