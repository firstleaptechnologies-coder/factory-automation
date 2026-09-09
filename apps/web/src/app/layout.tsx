import type {Metadata} from 'next';
import './globals.css';
import {AuthProvider} from '@/lib/auth';
import {ThemeProvider} from '@/lib/theme';
import {ErrorReporting} from '@/components/ErrorReporting';

export const metadata: Metadata = {
  title: 'FAS — Factory Automation Software',
  description: 'Production, material and waste management for a CNC decor unit',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>
        <ErrorReporting />
        <AuthProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
