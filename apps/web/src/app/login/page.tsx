'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { landingFor } from '@/lib/nav';
import { Button, Field, Icon } from '@/ui';

type Mode = 'workspace' | 'credentials' | 'platform';

/**
 * Signing in, workspace first.
 *
 * An employee code means nothing until you know which business it belongs to —
 * two shops on the platform can both have an "ADMIN". The workspace is checked
 * before a password is asked for, so a typo in the slug is caught while it is
 * still obvious what went wrong, and it is remembered afterwards because the
 * same browser almost always belongs to the same shop.
 */
export default function LoginPage() {
  const { workspace, signIn, signInAsPlatform, forgetWorkspace, user } = useAuth();

  const [mode, setMode] = useState<Mode>('workspace');
  const [slug, setSlug] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (workspace) {
      setSlug(workspace);
      setMode('credentials');
    }
  }, [workspace]);

  useEffect(() => {
    const destination = landingFor(user);
    if (destination) window.location.href = destination;
  }, [user]);

  const checkWorkspace = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.workspaceExists(slug.trim().toLowerCase());
      if (!result.exists) {
        setError(`No workspace called "${slug.trim()}"`);
        return;
      }
      setSlug(result.slug);
      setMode('credentials');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the server');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'platform') {
        await signInAsPlatform(identifier.trim(), password);
      } else {
        await signIn(slug.trim().toLowerCase(), identifier.trim(), password);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--s-lg)',
      }}>
      <div style={{ width: 'min(400px, 100%)' }} className="enter">
        <div style={{ textAlign: 'center', marginBottom: 'var(--s-xxl)' }}>
          {/* The lockup carries the name and the tagline, so neither is
              repeated under it. Light artwork: the sign-in ground is dark and
              the brand teal all but disappears on it. */}
          <img
            src="/fas-lockup-light.png"
            alt="FAS — Factory Automation Software, by FirstLeap Technologies"
            style={{ width: 190, height: 'auto', margin: '0 auto', display: 'block' }}
          />
          <p className="t-small muted" style={{ margin: 'var(--s-lg) 0 0' }}>
            Order punching for the floor
          </p>
        </div>

        {mode === 'workspace' ? (
          <>
            <Field
              label="Workspace"
              placeholder="your-shop"
              icon="box"
              value={slug}
              onChange={setSlug}
              hint="The short name your provider gave you."
              error={error}
              autoFocus
              onEnter={checkWorkspace}
            />
            <Button
              title="Continue"
              size="lg"
              block
              loading={busy}
              disabled={!slug.trim()}
              onClick={checkWorkspace}
            />
          </>
        ) : (
          <>
            {mode === 'credentials' ? (
              <div className="wrap" style={{ marginBottom: 'var(--s-lg)' }}>
                <span className="chip" data-selected style={{ cursor: 'default' }}>
                  <Icon name="box" size={14} />
                  {slug}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    forgetWorkspace();
                    setMode('workspace');
                    setPassword('');
                    setError(null);
                  }}>
                  change
                </button>
              </div>
            ) : null}

            <Field
              label={mode === 'platform' ? 'Email' : 'Employee code'}
              placeholder={mode === 'platform' ? 'you@example.com' : 'e.g. ADMIN'}
              icon="user"
              value={identifier}
              onChange={setIdentifier}
              autoFocus
            />
            <Field
              label="Password"
              type="password"
              icon="lock"
              value={password}
              onChange={setPassword}
              error={error}
              onEnter={submit}
            />
            <Button
              title="Sign in"
              size="lg"
              block
              loading={busy}
              disabled={!identifier.trim() || !password}
              onClick={submit}
            />
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: 'var(--s-xl)' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setError(null);
              setIdentifier('');
              setPassword('');
              setMode(mode === 'platform' ? (workspace ? 'credentials' : 'workspace') : 'platform');
            }}>
            {mode === 'platform' ? 'Back to workspace sign in' : 'Platform administration'}
          </button>
        </div>
      </div>
    </div>
  );
}
