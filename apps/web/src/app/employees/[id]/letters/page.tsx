'use client';

import { use, useState } from 'react';
import type { Employee, Letter, LetterTemplate } from '@fas/shared';
import { LETTER_LABELS, PERMISSIONS, today } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { Button, Card, EmptyState, Field, Loader, PageHead, Sheet } from '@/ui';
import { Select } from '@/ui/Select';
import { formatDateShort } from '@/lib/format';

export default function EmployeeLettersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Shell>
      <Letters employeeId={id} />
    </Shell>
  );
}

/**
 * The letters one person has been given.
 *
 * The body is drafted from a template on the server, shown here to be read and
 * changed, and then filed as it stands. What is kept is the words that were
 * handed over — a template edited next year must not change what is in
 * somebody's file from last March.
 */
function Letters({ employeeId }: { employeeId: string }) {
  const { can } = useAuth();
  const employee = useApi<Employee>(() => api.employee(employeeId), [employeeId]);
  const letters = useApi<Letter[]>(() => api.letters({ employeeId }), [employeeId]);
  const templates = useApi<LetterTemplate[]>(() => api.letterTemplates(), []);

  const [writing, setWriting] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [issuedOn, setIssuedOn] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManage = can(PERMISSIONS.EMPLOYEE_MANAGE);
  const rows = letters.data ?? [];

  /** Pulls the wording, filled in for this person, off the server. */
  const pickTemplate = async (id: string) => {
    setTemplateId(id);
    const draft = await api.letterDraft(id, employeeId);
    setTitle(draft.title);
    setBody(draft.body);
  };

  const issue = async () => {
    const template = templates.data?.find((one) => one.id === templateId);
    if (!template) return;

    setBusy(true);
    setError(null);
    try {
      await api.issueLetter({
        employeeId,
        kind: template.kind,
        title: title.trim(),
        body,
        issuedOn,
      });
      setWriting(false);
      setTemplateId(null);
      setBody('');
      letters.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        title="Letters"
        subtitle={employee.data?.name ?? ''}
        action={
          canManage ? (
            <Button title="Write a letter" icon="plus" onClick={() => setWriting(true)} />
          ) : null
        }
      />

      {letters.loading ? (
        <Loader />
      ) : rows.length === 0 ? (
        <EmptyState title="No letters yet" />
      ) : (
        <Card size="sm" className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Letter</th>
                <th>What for</th>
                <th>Dated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((letter) => (
                <tr key={letter.id}>
                  <td className="bold">{letter.title}</td>
                  <td className="muted">{LETTER_LABELS[letter.kind]}</td>
                  <td className="muted">{formatDateShort(letter.issuedOn)}</td>
                  <td>
                    <a
                      className="t-small"
                      href={api.letterDocumentUrl(letter.id)}
                      target="_blank"
                      rel="noreferrer">
                      Open it
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Sheet
        open={writing}
        title="Write a letter"
        subtitle="Drafted from a template, then kept as it is given"
        onClose={() => setWriting(false)}>
        <Select
          label="Which letter"
          value={templateId}
          options={(templates.data ?? [])
            .filter((template) => template.isActive)
            .map((template) => ({
              value: template.id,
              label: `${LETTER_LABELS[template.kind]} · ${template.name}`,
            }))}
          onChange={pickTemplate}
        />
        <Field label="Heading" value={title} onChange={setTitle} />
        <Field label="What it says" value={body} onChange={setBody} multiline rows={12} />
        <Field label="Dated" type="date" value={issuedOn} onChange={setIssuedOn} />
        {error ? (
          <div className="t-small" style={{ color: 'var(--danger)', marginBottom: 'var(--s-md)' }}>
            {error}
          </div>
        ) : null}
        <Button
          title="File it"
          block
          loading={busy}
          disabled={!templateId || body.trim().length < 20}
          onClick={issue}
        />
      </Sheet>
    </>
  );
}
