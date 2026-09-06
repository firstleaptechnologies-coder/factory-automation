'use client';

import type { CustomFieldDefinition } from '@decor/shared';

/**
 * Renders the admin's field definitions as a form.
 *
 * Nothing here knows what a lead contains — the shop adds "architect" or
 * "budget band" in the admin screen and the input appears, which is what makes
 * the capture genuinely customisable rather than a fixed form with spare boxes.
 */
export function CustomFields({
  definitions,
  values,
  onChange,
}: {
  definitions: CustomFieldDefinition[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}) {
  const set = (key: string, value: unknown) => onChange({ ...values, [key]: value });

  return (
    <div className="custom-field-grid">
      {definitions.map((field) => {
        const value = values[field.key];
        const label = (
          <label htmlFor={`cf-${field.key}`}>
            {field.label}
            {field.required ? ' *' : ''}
          </label>
        );

        switch (field.type) {
          case 'BOOLEAN':
            return (
              <div className="field" key={field.id}>
                {label}
                <select
                  id={`cf-${field.key}`}
                  value={value === true ? 'true' : value === false ? 'false' : ''}
                  onChange={(e) =>
                    set(field.key, e.target.value === '' ? undefined : e.target.value === 'true')
                  }>
                  <option value="">—</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
                {field.helpText ? <small className="muted">{field.helpText}</small> : null}
              </div>
            );

          case 'SELECT':
            return (
              <div className="field" key={field.id}>
                {label}
                <select
                  id={`cf-${field.key}`}
                  value={(value as string) ?? ''}
                  onChange={(e) => set(field.key, e.target.value || undefined)}>
                  <option value="">—</option>
                  {field.options.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                {field.helpText ? <small className="muted">{field.helpText}</small> : null}
              </div>
            );

          case 'MULTI_SELECT': {
            const selected = Array.isArray(value) ? (value as string[]) : [];
            return (
              <div className="field" key={field.id}>
                {label}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {field.options.map((option) => {
                    const on = selected.includes(option);
                    return (
                      <button
                        type="button"
                        key={option}
                        className={on ? 'primary' : ''}
                        style={{ padding: '5px 10px', fontSize: 12 }}
                        onClick={() =>
                          set(
                            field.key,
                            on ? selected.filter((v) => v !== option) : [...selected, option],
                          )
                        }>
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          }

          case 'LONG_TEXT':
            return (
              <div className="field" key={field.id} style={{ gridColumn: '1 / -1' }}>
                {label}
                <input
                  id={`cf-${field.key}`}
                  value={(value as string) ?? ''}
                  onChange={(e) => set(field.key, e.target.value || undefined)}
                />
              </div>
            );

          default:
            return (
              <div className="field" key={field.id}>
                {label}
                <input
                  id={`cf-${field.key}`}
                  type={
                    field.type === 'NUMBER'
                      ? 'number'
                      : field.type === 'DATE'
                        ? 'date'
                        : field.type === 'EMAIL'
                          ? 'email'
                          : 'text'
                  }
                  value={(value as string) ?? ''}
                  onChange={(e) => set(field.key, e.target.value || undefined)}
                />
                {field.helpText ? <small className="muted">{field.helpText}</small> : null}
              </div>
            );
        }
      })}
    </div>
  );
}
