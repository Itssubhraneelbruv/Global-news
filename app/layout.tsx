import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Clickable Globe',
  description: 'A simple clickable 3D globe built with Next.js and react-globe.gl'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
