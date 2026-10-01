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
  metadataBase: new URL('https://agendando.site'),
  title: 'Agendando — Agenda, Organiza, Logra | Control de Alumnos y Clases',
  description: 'Sistema integral de gestión de alumnos, cupos, clases particulares y grupales, mensualidades y recordatorios por WhatsApp.',
  openGraph: {
    title: 'Agendando — Agenda, Organiza, Logra',
    description: 'Sistema integral de gestión de alumnos, cupos, clases particulares y grupales, mensualidades y recordatorios por WhatsApp.',
    images: [{ url: '/logo.png', width: 1000, height: 800, alt: 'Agendando — Agenda, Organiza, Logra' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Agendando — Agenda, Organiza, Logra',
    description: 'Sistema integral de gestión de alumnos, cupos, clases particulares y grupales, mensualidades y recordatorios por WhatsApp.',
    images: ['/logo.png'],
  },
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/logo-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
