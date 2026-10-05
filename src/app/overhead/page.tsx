import type { Metadata } from 'next';
import PageShell from '@/components/shell/PageShell';
import OverheadView from '@/components/overhead/OverheadView';

export const metadata: Metadata = { title: 'Overhead' };

export default function OverheadPage() {
  return (
    <PageShell active="overhead">
      <OverheadView />
    </PageShell>
  );
}
