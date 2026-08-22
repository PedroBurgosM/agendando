import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'Nexo — Agenda inteligente para tu negocio',
  description: 'Gestiona reservas, clientes, pagos y recordatorios desde un solo lugar.',
  openGraph: {
    title: 'Nexo — Agenda inteligente para tu negocio',
    description: 'Gestiona reservas, clientes, pagos y recordatorios desde un solo lugar.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Nexo — Agenda inteligente para tu negocio' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nexo — Agenda inteligente para tu negocio',
    description: 'Gestiona reservas, clientes, pagos y recordatorios desde un solo lugar.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
