import type { Metadata } from 'next';
import PageShell from '@/components/shell/PageShell';
import FollowingView from '@/components/following/FollowingView';

export const metadata: Metadata = { title: 'Following' };

export default function FollowingPage() {
  return (
    <PageShell active="following">
      <FollowingView />
    </PageShell>
  );
}
