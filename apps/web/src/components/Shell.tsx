'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';

const NAV = [
  { href: '/punch', label: 'Punch order' },
  { href: '/orders', label: 'Orders' },
  { href: '/board', label: 'Board' },
  { href: '/clients', label: 'Clients' },
];

const ADMIN_NAV = [
  { href: '/admin/materials', label: 'Materials' },
  { href: '/admin/sizes', label: 'Sizes' },
  { href: '/admin/flow', label: 'Status flow' },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading) return <div className="center-screen muted">Loading…</div>;
  if (!user) return null;

  const isAdmin = user.role === 'ADMIN';

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="brand">
          Decor Bucket
          <small>Order punching</small>
        </div>

        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link${pathname === item.href ? ' active' : ''}`}>
            {item.label}
          </Link>
        ))}

        {isAdmin ? (
          <>
            <div className="nav-heading">Admin</div>
            {ADMIN_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link${pathname === item.href ? ' active' : ''}`}>
                {item.label}
              </Link>
            ))}
          </>
        ) : null}

        <div style={{ marginTop: 'auto', paddingTop: 16 }}>
          <div style={{ padding: '0 10px 8px' }}>
            <div style={{ fontWeight: 600 }}>{user.name}</div>
            <div className="muted" style={{ fontSize: 12 }}>{user.role}</div>
          </div>
          <button onClick={signOut} style={{ width: '100%' }}>Sign out</button>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
