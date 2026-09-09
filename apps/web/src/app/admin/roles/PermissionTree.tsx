'use client';

import {
  MODULE_CATALOGUE,
  PERMISSION_LABELS,
  PERMISSION_TREE,
  hasModule,
  permissionsUnder,
  tickState,
  toggleBranch,
} from '@fas/shared';
import type { Permission, TickState } from '@fas/shared';

/**
 * Every permission, as the four-level tree it actually is.
 *
 *   module → feature → group → permission
 *
 * Select all sits at each level, and it is three-state: a branch with some of
 * its permissions held reads as part-ticked rather than as off, because
 * showing it as off invites somebody to tick it and silently grant the rest.
 *
 * A section whose module the workspace has not bought is shown, greyed, and
 * cannot be ticked. Hiding it would be worse: somebody wondering where
 * Purchasing went needs to see that it exists and is not on their plan, not
 * conclude the product does not have it.
 */

function Box({ state }: { state: TickState }) {
  return (
    <span className="perm-box" data-state={state} aria-hidden>
      {state === 'all' ? '✓' : state === 'some' ? '–' : ''}
    </span>
  );
}

export function PermissionTree({
  granted,
  modules,
  onChange,
}: {
  granted: string[];
  /** What the workspace has bought. Undefined means everything is reachable. */
  modules?: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="perm-tree">
      {PERMISSION_TREE.map((section) => {
        const all = permissionsUnder(section);
        const bought = section.module === null || hasModule(modules, section.module);
        const state = tickState(all, granted);
        const moduleLabel = MODULE_CATALOGUE.find((one) => one.key === section.module)?.label;

        return (
          <section
            key={section.key}
            className="perm-section"
            data-locked={!bought}
            aria-disabled={!bought}>
            <header className="perm-section-head">
              <div>
                <span className="t-label">{section.label}</span>
                {!bought && (
                  <span className="t-tiny faint">
                    {' '}
                    — {moduleLabel ?? section.module} is not on this workspace’s plan
                  </span>
                )}
              </div>
              {bought && (
                <button
                  type="button"
                  className="perm-all"
                  onClick={() => onChange(toggleBranch(all, granted))}>
                  <Box state={state} />
                  Select all
                </button>
              )}
            </header>

            {section.features.map((feature) => {
              const featureAll = permissionsUnder(feature);
              return (
                <div key={feature.key} className="perm-feature">
                  <div className="perm-feature-head">
                    <div style={{ minWidth: 0 }}>
                      <div className="t-small perm-strong">{feature.label}</div>
                      {feature.blurb && <div className="t-tiny faint">{feature.blurb}</div>}
                    </div>
                    {bought && (
                      <button
                        type="button"
                        className="perm-all"
                        onClick={() => onChange(toggleBranch(featureAll, granted))}>
                        <Box state={tickState(featureAll, granted)} />
                        Select all
                      </button>
                    )}
                  </div>

                  {feature.groups.map((group) => (
                    <div key={group.key} className="perm-group">
                      <button
                        type="button"
                        className="perm-group-head"
                        disabled={!bought}
                        onClick={() => onChange(toggleBranch(group.permissions, granted))}>
                        <Box state={tickState(group.permissions, granted)} />
                        <span className="t-tiny">{group.label}</span>
                      </button>

                      <div className="perm-checks">
                        {group.permissions.map((permission) => {
                          const on = granted.includes(permission);
                          return (
                            <label key={permission} className="perm-check" data-on={on}>
                              <input
                                type="checkbox"
                                checked={on}
                                disabled={!bought}
                                onChange={() =>
                                  onChange(
                                    on
                                      ? granted.filter((one) => one !== permission)
                                      : [...granted, permission],
                                  )
                                }
                              />
                              <Box state={on ? 'all' : 'none'} />
                              <span>{PERMISSION_LABELS[permission as Permission] ?? permission}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
