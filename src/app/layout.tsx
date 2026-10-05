import type { Metadata, Viewport } from 'next';
import { Archivo, Geist_Mono } from 'next/font/google';
import './globals.css';

const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin'],
  axes: ['wdth'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'Contrail · The sky, live', template: '%s · Contrail' },
  description: 'A free, live flight tracker built on open ADS-B data. Follow any flight, see what’s overhead, and watch the sky in real time.',
  applicationName: 'Contrail',
  appleWebApp: { capable: true, title: 'Contrail', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#070a10',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${archivo.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
