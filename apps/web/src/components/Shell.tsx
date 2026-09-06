'use client';

import Link from 'next/link';
import {usePathname, useRouter} from 'next/navigation';
import {useEffect} from 'react';
import {useAuth} from '@/lib/auth';

const NAV = [
  {href: '/', label: 'Dashboard'},
  {href: '/production', label: 'Production'},
  {href: '/orders', label: 'Orders'},
  {href: '/nesting', label: 'Nesting'},
  {href: '/inventory', label: 'Inventory'},
  {href: '/waste', label: 'Waste'},
  {href: '/reports', label: 'Reports'},
];

export function Shell({children}: {children: React.ReactNode}) {
  const {user, loading, signOut} = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading) return <div className="center-screen muted">Loading…</div>;
  if (!user) return null;

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="brand">
          Decor Bucket
          <small>Manufacturing ERP</small>
        </div>
        {NAV.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link${pathname === item.href ? ' active' : ''}`}>
            {item.label}
          </Link>
        ))}
        <div style={{marginTop: 'auto', paddingTop: 16}}>
          <div style={{padding: '0 10px 8px'}}>
            <div style={{fontWeight: 600}}>{user.name}</div>
            <div className="muted" style={{fontSize: 12}}>{user.role}</div>
          </div>
          <button onClick={signOut} style={{width: '100%'}}>Sign out</button>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
