'use client';

import type { ReactNode } from 'react';
import CommandPalette from '@/components/search/CommandPalette';
import { Brand, Rail, TabBar } from './Chrome';

/** Layout for the non-map pages: rail on desktop, tab bar on phones, search everywhere. */
export default function PageShell({ active, children }: { active: 'airports' | 'following' | 'overhead'; children: ReactNode }) {
  return (
    <>
      <div className="page">
        <div className="page__rail">
          <Brand compact />
          <Rail active={active} />
        </div>
        <main className="page__main">
          <div className="page__inner">{children}</div>
        </main>
        <TabBar active={active === 'airports' ? 'map' : active} />
      </div>
      <CommandPalette />
    </>
  );
}
