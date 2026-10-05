import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PageShell from '@/components/shell/PageShell';
import AirportView from '@/components/airport/AirportView';
import { findAirport, runwaysFor } from '@/lib/server/airportsIndex';

export async function generateMetadata(props: PageProps<'/airport/[code]'>): Promise<Metadata> {
  const { code } = await props.params;
  const a = findAirport(code);
  return { title: a ? `${a.iata || a.icao} · ${a.name}` : 'Airport not found' };
}

export default async function AirportPage(props: PageProps<'/airport/[code]'>) {
  const { code } = await props.params;
  const airport = findAirport(code);
  if (!airport) notFound();
  return (
    <PageShell active="airports">
      <AirportView airport={airport} runways={runwaysFor(airport.icao)} />
    </PageShell>
  );
}
