'use client';

import { useState } from 'react';
import type { LetterKind, LetterTemplate } from '@decor/shared';
import {
  LETTER_FIELDS,
  LETTER_FIELD_LABELS,
  LETTER_HINTS,
  LETTER_KINDS,
  LETTER_LABELS,
  unknownPlaceholders,
} from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { Shell } from '@/components/Shell';
import { Button, Card, Chip, Field, Loader, PageHead, Pill, Sheet } from '@/ui';
import { Select } from '@/ui/Select';

export default function LetterTemplatesPage() {
  return (
    <Shell>
      <Templates />
    </Shell>
  );
}

/**
 * What each letter says, before it is about anybody.
 *
 * The words are the shop's. The placeholders in double braces are filled in
 * when a letter is issued — and a placeholder nothing can fill is called out
 * here, because braces printed on a page somebody hands to a bank is the sort
 * of mistake nobody notices until it has happened.
 */
function Templates() {
  const templates = useApi<LetterTemplate[]>(() => api.letterTemplates(), []);

  const [editing, setEditing] = useState<LetterTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<LetterKind>('OFFER');
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = (template: LetterTemplate | null) => {
    setEditing(template);
    setCreating(template === null);
    setKind(template?.kind ?? 'OFFER');
    setName(template?.name ?? '');
    setBody(template?.body ?? '');
    setError(null);
  };

  const close = () => {
    setEditing(null);
    setCreating(false);
  };

  const unknown = unknownPlaceholders(body);

  return (
    <>
      <PageHead
        title="Letter templates"
        subtitle="What each letter says, in your words"
        action={<Button title="New template" icon="plus" onClick={() => open(null)} />}
      />

      {templates.loading ? (
        <Loader />
      ) : (
        <Card size="sm" className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Called</th>
                <th>What for</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(templates.data ?? []).map((template) => (
                <tr
                  key={template.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => open(template)}>
                  <td className="bold">{template.name}</td>
                  <td className="muted">{LETTER_LABELS[template.kind]}</td>
                  <td>
                    {template.isActive ? null : (
                      <Pill label="Hidden" color="var(--text-faint)" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Sheet
        open={Boolean(editing) || creating}
        title={creating ? 'New template' : (editing?.name ?? '')}
        subtitle={LETTER_HINTS[kind]}
        onClose={close}>
        <Select
          label="Which letter"
          value={kind}
          options={LETTER_KINDS.map((key) => ({ value: key, label: LETTER_LABELS[key] }))}
          onChange={(value) => setKind(value as LetterKind)}
        />
        <Field label="Called" value={name} onChange={setName} />
        <Field label="What it says" value={body} onChange={setBody} multiline rows={12} />

        <div className="t-tiny muted" style={{ marginBottom: 'var(--s-sm)' }}>
          Click to drop one of these in. They are filled in when a letter is issued.
        </div>
        <div className="row" style={{ marginBottom: 'var(--s-md)' }}>
          {LETTER_FIELDS.map((field) => (
            <Chip
              key={field}
              label={LETTER_FIELD_LABELS[field]}
              onClick={() => setBody((current) => `${current}{{${field}}}`)}
            />
          ))}
        </div>

        {unknown.length > 0 ? (
          <div className="t-small" style={{ color: 'var(--warning)', marginBottom: 'var(--s-md)' }}>
            Nothing will fill in {unknown.map((one) => `{{${one}}}`).join(', ')} — it will print
            as it is.
          </div>
        ) : null}

        {error ? (
          <div className="t-small" style={{ color: 'var(--danger)', marginBottom: 'var(--s-md)' }}>
            {error}
          </div>
        ) : null}

        <Button
          title="Save"
          block
          loading={busy}
          disabled={name.trim().length < 2 || body.trim().length < 20}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const payload = { kind, name: name.trim(), body };
              if (editing) await api.updateLetterTemplate(editing.id, payload);
              else await api.createLetterTemplate(payload);
              close();
              templates.reload();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Unknown error');
            } finally {
              setBusy(false);
            }
          }}
        />
      </Sheet>
    </>
  );
}
