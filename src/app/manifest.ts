import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Contrail · The sky, live',
    short_name: 'Contrail',
    description: 'A free, live flight tracker built on open ADS-B data.',
    start_url: '/',
    display: 'standalone',
    background_color: '#070a10',
    theme_color: '#070a10',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
