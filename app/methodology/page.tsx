import type { Metadata } from 'next';
import MethodologyPinGate from './MethodologyPinGate';

export const metadata: Metadata = { title: 'Methodology' };

export const dynamic = 'force-dynamic';

export default function Page() {
  return <MethodologyPinGate />;
}
