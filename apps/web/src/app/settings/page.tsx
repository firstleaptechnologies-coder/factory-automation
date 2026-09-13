'use client';

import { LENGTH_UNITS, UNIT_LABEL } from '@fas/shared';
import { useAuth } from '@/lib/auth';
import { useDisplayUnit } from '@/lib/useUnit';
import { Shell } from '@/components/Shell';
import { Avatar, Button, Card, Chip, PageHead, SectionHead } from '@/ui';

export default function SettingsPage() {
  return (
    <Shell>
      <Settings />
    </Shell>
  );
}

/**
 * This browser, and who is using it.
 *
 * Small on purpose. Everything about the *business* — the letterhead, the GST
 * number, who may do what — belongs to the workspace and lives under Firm
 * details and Roles; what is left is what belongs to the person in front of
 * this screen, which is the unit they think in and the way out.
 *
 * It exists because the app has had it since the beginning and the browser had
 * nowhere to put the display unit at all: every screen kept its own, so a shop
 * that works in feet re-picked feet on every page and lost it on every reload.
 */
function Settings() {
  const { user, signOut } = useAuth();
  const [unit, setUnit] = useDisplayUnit();

  const server = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api').replace(
    /\/api\/?$/,
    '',
  );

  return (
    <>
      <PageHead title="Settings" subtitle="This browser, and who is using it" />

      <Card tone="accent" className="row" style={{ alignItems: 'center', gap: 'var(--s-lg)' }}>
        <Avatar name={user?.name ?? '?'} size={54} />
        <div style={{ minWidth: 0 }}>
          <div className="t-h2">{user?.name}</div>
          <div className="t-small" style={{ opacity: 0.75 }}>
            {[user?.code, user?.roleName ?? user?.role].filter(Boolean).join(' · ')}
          </div>
        </div>
      </Card>

      <SectionHead title="Display" />
      <Card>
        <p className="t-small muted">
          Sizes are always stored in millimetres. This only changes what you see.
        </p>
        <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--s-sm)' }}>
          {LENGTH_UNITS.map((one) => (
            <Chip
              key={one}
              label={UNIT_LABEL[one]}
              selected={unit === one}
              onClick={() => setUnit(one)}
            />
          ))}
        </div>
      </Card>

      <SectionHead title="About" />
      <Card>
        <Row label="Server" value={server} />
        <Row label="Signed in as" value={user?.code ?? '—'} />
        <Row label="Role" value={user?.roleName ?? user?.role ?? '—'} />
      </Card>

      <Button
        title="Sign out"
        variant="danger"
        onClick={signOut}
        style={{ marginTop: 'var(--s-xl)' }}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row-between" style={{ padding: 'var(--s-sm) 0', gap: 'var(--s-lg)' }}>
      <span className="t-small muted">{label}</span>
      <span className="t-small bold truncate">{value}</span>
    </div>
  );
}
