'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  PRODUCT_MANUAL,
  manualFor,
  manualHtml,
  platformModules,
  undefinedFields,
  workspaceModules,
} from '@fas/shared';
import { useAuth } from '@/lib/auth';
import { Button, Card, Field, Loader, PageHead, Pill, SectionHead } from '@/ui';

/**
 * What has been built, module by module — and the copy a vendor is handed.
 *
 * Generated from the code that runs rather than written alongside it: a manual
 * kept by hand is wrong by its second release, and one that is wrong is worse
 * than none, because it is read exactly when somebody is unsure and it
 * confirms whatever it says. The structure comes from the controllers and the
 * screens; the explanations come from the doc comments beside them, and a
 * field that ships without one fails the build.
 *
 * The export exists because a shop should be sent what it bought. Handing a
 * shop with no Purchasing thirty pages about Purchasing means they either try
 * to use it or ask why it is missing, and both are our doing. The console is
 * never exportable at all — what FirstLeap does above a shop is not a shop's
 * business.
 */
export default function ManualPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    if (!loading && user && !user.isPlatform) router.replace('/');
  }, [loading, user, router]);

  const forSale = workspaceModules(PRODUCT_MANUAL);
  const ours = platformModules(PRODUCT_MANUAL);

  // Everything to begin with: unticking what a shop did not buy is a smaller
  // job than remembering what they did.
  const [chosen, setChosen] = useState<string[]>(() => forSale.map((m) => m.key));
  const [firm, setFirm] = useState('');
  const [reading, setReading] = useState<string>(forSale[0]?.key ?? '');

  const gaps = useMemo(() => undefinedFields(PRODUCT_MANUAL), []);
  const explained = useMemo(
    () => PRODUCT_MANUAL.modules.flatMap((m) => m.actions.flatMap((a) => a.fields)).length,
    [],
  );
  const shown = [...forSale, ...ours].find((m) => m.key === reading) ?? forSale[0];

  const toggle = (key: string) =>
    setChosen((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );

  const exportManual = () => {
    const html = manualHtml(manualFor(PRODUCT_MANUAL, chosen), {
      firm: firm.trim() || undefined,
    });
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `fas-manual-${firm.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'all'}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  if (loading || !user) return <Loader />;

  return (
    <div className="shell-main" style={{ margin: '0 auto' }}>
      <PageHead
        title="What the software does"
        subtitle="Every module, every screen, and every field somebody types into"
        action={
          <Button
            title="Releases"
            variant="ghost"
            onClick={() => router.push('/platform/releases')}
          />
        }
      />

      <Card size="sm">
        <p className="t-small muted" style={{ margin: 0 }}>
          Written from the code that actually runs — the screens, the routes and
          the rules the API enforces. It cannot describe a version of the
          product that does not exist, and a new field cannot ship without its
          explanation.
          {gaps.length ? (
            <>
              {' '}
              <strong>{gaps.length} fields</strong> still have no explanation
              written; they appear below marked as such rather than silently
              missing.
            </>
          ) : (
            <>
              {' '}
              All <strong>{explained} fields</strong> are explained — and a new
              one cannot ship without its explanation.
            </>
          )}
        </p>
      </Card>

      <SectionHead title="Send it to a vendor" />
      <Card size="sm">
        <p className="t-small muted" style={{ marginTop: 0 }}>
          Tick what this shop bought. The console is never included.
        </p>
        <div className="wrap" style={{ marginBottom: 'var(--s-md)' }}>
          {forSale.map((module) => (
            <label key={module.key} className="pick">
              <input
                type="checkbox"
                checked={chosen.includes(module.key)}
                onChange={() => toggle(module.key)}
              />
              <span>{module.label}</span>
              {module.sold ? null : <Pill label="included" color="var(--text-faint)" />}
            </label>
          ))}
        </div>
        <Field
          label="Prepared for"
          placeholder="Decor Bucket"
          value={firm}
          onChange={setFirm}
          hint="Printed at the top, so it reads as something sent rather than something leaked."
        />
        <div className="row" style={{ gap: 'var(--s-sm)' }}>
          <Button
            title={`Export ${chosen.length} module${chosen.length === 1 ? '' : 's'}`}
            onClick={exportManual}
            disabled={chosen.length === 0}
          />
          <Button
            title={chosen.length === forSale.length ? 'Untick all' : 'Tick all'}
            variant="ghost"
            onClick={() =>
              setChosen(chosen.length === forSale.length ? [] : forSale.map((m) => m.key))
            }
          />
        </div>
      </Card>

      <SectionHead title="Read it" />
      <div className="wrap" style={{ marginBottom: 'var(--s-md)' }}>
        {[...forSale, ...ours].map((module) => (
          <button
            key={module.key}
            type="button"
            onClick={() => setReading(module.key)}
            className={`chip${module.key === reading ? ' chip-on' : ''}`}>
            {module.label}
          </button>
        ))}
      </div>

      {shown ? (
        <Card size="sm" testId="manual-body">
          {shown.audience === 'platform' ? (
            <Pill label="ours — never exported" color="var(--danger)" />
          ) : null}
          <h2 className="t-h2" style={{ marginTop: 'var(--s-sm)' }}>
            {shown.label}
          </h2>
          <p className="t-small">{shown.summary}</p>

          {shown.flow.length ? (
            <>
              <SectionHead title="How it is used" />
              <ol className="manual-flow">
                {shown.flow.map((step) => (
                  <li key={step} className="t-small">
                    {step}
                  </li>
                ))}
              </ol>
            </>
          ) : null}

          {shown.screens.length ? (
            <>
              <SectionHead title={`Screens (${shown.screens.length})`} />
              <ul className="manual-screens">
                {shown.screens.map((screen) => (
                  <li key={screen.key}>
                    <span className="t-small bold">{screen.label}</span>
                    {screen.blurb ? <span className="t-small muted"> — {screen.blurb}</span> : null}
                    <div className="t-tiny faint">
                      {[screen.web && `web ${screen.web}`, screen.app && `app ${screen.app}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <SectionHead title={`What it does (${shown.actions.length})`} />
          {shown.actions.length === 0 ? (
            <p className="t-small muted">Nothing is built yet.</p>
          ) : (
            shown.actions.map((action) => (
              <div key={`${action.method} ${action.path}`} className="manual-action">
                <div className="t-small bold">
                  <code>
                    {action.method} {action.path}
                  </code>
                </div>
                {action.summary ? <p className="t-small muted">{action.summary}</p> : null}
                {action.fields.length === 0 ? (
                  <p className="t-tiny faint">Takes nothing — it only reads.</p>
                ) : (
                  <table className="manual-fields">
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>What it is</th>
                        <th>What it is for</th>
                      </tr>
                    </thead>
                    <tbody>
                      {action.fields.map((field) => (
                        <tr key={field.name}>
                          <td>
                            <code>{field.name}</code>
                            {field.required ? <span className="req"> required</span> : null}
                          </td>
                          <td>
                            {field.type}
                            {field.constraints.length ? (
                              <div className="t-tiny faint">{field.constraints.join(', ')}</div>
                            ) : null}
                          </td>
                          <td>
                            {field.definition || (
                              <span className="t-tiny faint">Not yet written up.</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))
          )}
        </Card>
      ) : null}
    </div>
  );
}
