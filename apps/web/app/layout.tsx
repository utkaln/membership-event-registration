import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OSA Community Platform',
  description: 'The Odisha Society of the Americas - Community Platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
