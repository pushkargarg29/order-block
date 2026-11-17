export default function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3b82f6" /><stop offset="1" stopColor="#22d3ee" /></linearGradient></defs>
      <rect width="64" height="64" rx="14" fill="#0a1630" stroke="#1f3766" />
      <rect x="14" y="30" width="8" height="20" rx="2" fill="url(#lg)" />
      <rect x="28" y="18" width="8" height="26" rx="2" fill="url(#lg)" />
      <rect x="42" y="12" width="8" height="22" rx="2" fill="url(#lg)" />
    </svg>
  );
}
