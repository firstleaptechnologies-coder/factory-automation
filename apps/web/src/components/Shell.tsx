'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NAV_GROUPS, NAV_HOME, type NavGroup, type NavItem } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { Avatar, Icon, IconName, Loader } from '@/ui';

const CLOSED_KEY = 'decor.nav.closed';

/**
 * The signed-in frame.
 *
 * The menu is grouped by what a screen is *for* and read from the shared
 * navigation tree, so the sidebar and the app's menu cannot drift apart and a
 * new screen has an obvious home. Groups collapse because the product is one
 * module today and will be several: a list that only grows becomes a list
 * nobody reads.
 *
 * Filtered by permission rather than by role name, the same way the API
 * decides: a tenant can rename or recombine their roles and the menu follows
 * without anyone editing a list.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut, can, has } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  /*
   * What is shut, rather than what is open.
   *
   * A group added in a later release is then open by default — the opposite
   * would hide a whole new module from everybody who had ever collapsed
   * anything.
   */
  const [closed, setClosed] = useState<string[]>([]);

  /*
   * What is waiting, on the bell.
   *
   * Asked for once per page rather than polled: the number is a nudge to open
   * the list, not a live feed, and a request every few seconds from every open
   * tab is a cost the shop pays for nothing.
   */
  const unread = useApi<{ unread: number }>(() => api.unreadNotifications(), []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CLOSED_KEY);
      if (saved) setClosed(JSON.parse(saved) as string[]);
    } catch {
      // A browser that refuses storage still gets a working menu.
    }
  }, []);

  const toggle = (key: string) => {
    setClosed((current) => {
      const next = current.includes(key)
        ? current.filter((one) => one !== key)
        : [...current, key];
      try {
        window.localStorage.setItem(CLOSED_KEY, JSON.stringify(next));
      } catch {
        // Not worth failing a click over.
      }
      return next;
    });
  };

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    // A platform admin belongs to no workspace, so the shop's screens would be
    // empty for them.
    if (!loading && user?.isPlatform && !pathname.startsWith('/platform')) {
      router.replace('/platform/tenants');
    }
  }, [loading, user, pathname, router]);

  if (loading) return <Loader label="Loading" />;
  if (!user) return null;

  /*
   * Two gates, and both have to pass.
   *
   * The plan decides what the business bought, the role decides who inside it
   * may touch it. Hiding the item is a courtesy — the API refuses the route
   * either way — but a menu full of screens that say no is not a product.
   */
  const visible = (item: NavItem) =>
    Boolean(item.web) &&
    (!item.permission || can(item.permission)) &&
    (!item.module || has(item.module));

  /** A group is worth showing when anything inside it is. */
  const groupHas = (group: NavGroup): boolean =>
    group.items.some(visible) || (group.groups ?? []).some(groupHas);

  /** Whichever group holds the current page stays open, however it was left. */
  const holdsCurrent = (group: NavGroup): boolean =>
    group.items.some((item) => item.web && item.web !== '/' && pathname.startsWith(item.web)) ||
    (group.groups ?? []).some(holdsCurrent);

  const renderGroup = (group: NavGroup, depth = 0) => {
    if (!groupHas(group)) return null;
    const shut = closed.includes(group.key) && !holdsCurrent(group);

    return (
      <div
        key={group.key}
        className="nav-section"
        data-depth={depth}
        // The rule lights up for the category holding the current page, so a
        // glance answers "where am I" without reading a label.
        data-current={holdsCurrent(group)}>
        <button
          type="button"
          className="nav-group"
          data-testid={`nav-group-${group.key}`}
          aria-expanded={!shut}
          onClick={() => toggle(group.key)}>
          <Icon name={shut ? 'chevronRight' : 'chevronDown'} size={13} />
          {group.label}
        </button>

        {shut ? null : (
          <>
            {group.items.filter(visible).map((item) => (
              <NavLink key={item.key} item={item} pathname={pathname} />
            ))}
            {(group.groups ?? []).map((inner) => renderGroup(inner, depth + 1))}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="shell">
      {/*
        Up the whole time, and not dismissible.

        A support session that looks like an ordinary one is how a shop ends up
        believing its own admin did something.
      */}
      {user.impersonatedBy ? (
        <div className="support-banner" role="status">
          <span>
            <strong>{user.impersonatedBy.name}</strong> from FirstLeap support is in this
            workspace as {user.name}. Everything done here is recorded under that name.
          </span>
          <button type="button" className="chip" onClick={signOut}>
            Leave
          </button>
        </div>
      ) : null}
      <nav className="shell-nav">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Icon name="scan" size={22} color="#fff" strokeWidth={2.1} />
          </span>
          <span>
            <span className="t-h3" style={{ display: 'block', lineHeight: 1.15 }}>
              FAS
            </span>
            <span className="t-tiny faint">Order punching</span>
          </span>
        </Link>

        {/* Home sits outside the categories: it is where you land, not
            somewhere you go looking for. */}
        <NavLink item={NAV_HOME} pathname={pathname} />

        <Link href="/notifications" className="nav-link" data-active={pathname === '/notifications'}>
          <Icon name="bell" size={17} />
          Notifications
          {unread.data?.unread ? (
            <span className="nav-badge" data-testid="unread-badge">
              {unread.data.unread > 9 ? '9+' : unread.data.unread}
            </span>
          ) : null}
        </Link>

        {NAV_GROUPS.map((group) => renderGroup(group))}

        <div style={{ marginTop: 'auto', paddingTop: 'var(--s-xl)' }}>
          <div className="row" style={{ padding: '0 var(--s-md) var(--s-md)' }}>
            <Avatar name={user.name ?? '?'} size={38} />
            <span style={{ minWidth: 0 }}>
              <span className="t-small bold truncate" style={{ display: 'block' }}>
                {user.name}
              </span>
              <span className="t-tiny faint">{user.code ?? user.role}</span>
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

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const href = item.web as string;
  // "/" would otherwise light up on every page.
  const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
  return (
    <Link href={href} className="nav-link" data-active={active}>
      <Icon name={item.icon as IconName} size={17} />
      {item.label}
    </Link>
  );
}
