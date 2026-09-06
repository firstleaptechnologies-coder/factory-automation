import type {Metadata} from 'next';
import './globals.css';
import {AuthProvider} from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Decor Bucket ERP',
  description: 'Production, material and waste management for a CNC decor unit',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
