'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PLATFORM_NAV, type NavGroup, type NavItem } from '@fas/shared';
import { useAuth } from '@/lib/auth';
import { Avatar, Icon, IconName, Loader } from '@/ui';

/**
 * FirstLeap's own console.
 *
 * Its own frame rather than the shop's, because the two answer to different
 * things. The shop's menu is gated twice — what they bought, and what the
 * person may do — and neither gate means anything here: a workspace's plan
 * cannot decide what we may see about them, and the permissions on this side
 * are ones no tenant role can hold.
 *
 * It is a sidebar and not a stack of pages with Back buttons because this is
 * where the business is run, not a settings corner. Somebody moving between a
 * workspace, its bill and its people should not be walking back up a path each
 * time.
 */
export function PlatformShell({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut, can } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    // Somebody signed into a workspace has no business in here, and the
    // screens would be empty for them anyway.
    if (!loading && user && !user.isPlatform) router.replace('/');
  }, [loading, user, router]);

  if (loading) return <Loader label="Loading" />;
  if (!user?.isPlatform) return null;

  const visible = (item: NavItem) =>
    Boolean(item.web) && (!item.permission || can(item.permission));

  const groupHas = (group: NavGroup) => group.items.some(visible);

  return (
    <div className="shell">
      <nav className="shell-nav">
        <Link href="/platform" className="brand">
          <span className="brand-mark">
            <Icon name="trend" size={22} color="#fff" strokeWidth={2.1} />
          </span>
          <span>
            <span className="t-h3" style={{ display: 'block', lineHeight: 1.15 }}>
              FirstLeap
            </span>
            <span className="t-tiny faint">The platform</span>
          </span>
        </Link>

        {PLATFORM_NAV.filter(groupHas).map((group) => (
          <div key={group.key} className="nav-section" data-testid={`nav-group-${group.key}`}>
            <span className="nav-group" aria-hidden>
              {group.label}
            </span>
            {group.items.filter(visible).map((item) => (
              <PlatformLink key={item.key} item={item} pathname={pathname} />
            ))}
          </div>
        ))}

        <div style={{ marginTop: 'auto', paddingTop: 'var(--s-xl)' }}>
          <div className="row" style={{ padding: '0 var(--s-md) var(--s-md)' }}>
            <Avatar name={user.name ?? '?'} size={38} />
            <span style={{ minWidth: 0 }}>
              <span className="t-small bold truncate" style={{ display: 'block' }}>
                {user.name}
              </span>
              <span className="t-tiny faint">{user.platformRole ?? 'FirstLeap'}</span>
            </span>
          </div>
          <button type="button" className="nav-link" onClick={signOut} style={{ width: '100%' }}>
            <Icon name="back" size={17} />
            Sign out
          </button>
        </div>
      </nav>
      <main className="shell-main">{children}</main>
    </div>
  );
}

function PlatformLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const href = item.web as string;
  /*
   * `/platform` is the overview and would otherwise light up on every page
   * under it, so it matches exactly. Everything else matches by prefix, which
   * is what keeps `Workspaces` lit while you are inside one.
   */
  const active = href === '/platform' ? pathname === '/platform' : pathname.startsWith(href);
  return (
    <Link href={href} className="nav-link" data-active={active}>
      <Icon name={item.icon as IconName} size={17} />
      {item.label}
    </Link>
  );
}
