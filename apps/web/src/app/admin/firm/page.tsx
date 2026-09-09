'use client';

import { useEffect, useState } from 'react';
import type { FirmProfile } from '@fas/shared';
import { ensureReadable, isReadable } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useTheme } from '@/lib/theme';
import { Shell } from '@/components/Shell';
import { ColorPicker } from '@/components/ColorPicker';
import {
  Button,
  Card,
  Field,
  Icon,
  Loader,
  PageHead,
  SectionHead,
  looksLikeGstin,
  looksLikePhone,
} from '@/ui';

/** A starting set. Anything is allowed via the hex field beside them. */
const BRAND_COLOURS = [
  '#FF6B1A',
  '#E4232F',
  '#F2A50C',
  '#2EA043',
  '#2F81F7',
  '#8957E5',
  '#00B3A4',
  '#D6455D',
];

export default function FirmPage() {
  return (
    <Shell>
      <Firm />
    </Shell>
  );
}

/**
 * The shop's own details, as they appear on anything it prints — and the one
 * colour its software is painted in.
 */
function Firm() {
  const profile = useApi<FirmProfile>(() => api.firmProfile(), []);
  const { accent, setAccent } = useTheme();

  const [form, setForm] = useState<Partial<FirmProfile>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile.data) setForm(profile.data);
  }, [profile.data]);

  const set = (key: keyof FirmProfile) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.saveFirmProfile(form);
      // Repaint straight away rather than on the next load — a colour you
      // picked and cannot see is indistinguishable from one that failed.
      if (form.themeAccent) setAccent(form.themeAccent);
      setSaved(true);
      profile.reload();
      setTimeout(() => setSaved(false), 2600);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const uploadLetterhead = async (file: File) => {
    const body = new FormData();
    body.append('file', file);
    await api.uploadLetterhead(body);
    profile.reload();
  };

  if (profile.loading) return <Loader label="Loading your firm" />;
  const chosen = (form.themeAccent ?? accent).toUpperCase();
  /** The nearest shade of what they picked that a label can be read on. */
  const readable = ensureReadable(chosen);

  return (
    <>
      <PageHead
        title="Firm details"
        subtitle="Printed on every estimate and bill, and used to brand your software"
        action={
          <Button
            title={saved ? 'Saved' : 'Save'}
            icon={saved ? 'check' : undefined}
            loading={busy}
            onClick={save}
          />
        }
      />

      {error ? (
        <Card size="sm" style={{ marginBottom: 'var(--s-lg)' }}>
          <span className="t-small danger">{error}</span>
        </Card>
      ) : null}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card>
          <SectionHead title="Identity" />
          <Field label="Firm name" value={form.name ?? ''} onChange={set('name')} />
          <Field
            label="GSTIN"
            placeholder="08AAWFD7264P1ZC"
            value={form.gstin ?? ''}
            onChange={set('gstin')}
            pasteAccepts={looksLikeGstin}
          />
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <Field
              label="State code"
              placeholder="08"
              value={form.stateCode ?? ''}
              onChange={set('stateCode')}
              style={{ flex: 1 }}
            />
            <Field
              label="State"
              placeholder="Rajasthan"
              value={form.stateName ?? ''}
              onChange={set('stateName')}
              style={{ flex: 2 }}
            />
          </div>
          <p className="t-tiny faint" style={{ marginTop: -8 }}>
            Your state decides whether a bill shows CGST and SGST or a single
            IGST line, so it has to match your registration.
          </p>

          <SectionHead title="Contact" />
          <Field
            label="Phone"
            value={form.phone ?? ''}
            onChange={set('phone')}
            pasteAccepts={looksLikePhone}
          />
          <Field label="Email" value={form.email ?? ''} onChange={set('email')} />
          <Field
            label="Address"
            value={form.address ?? ''}
            onChange={set('address')}
            multiline
          />
        </Card>

        <div className="stack-lg">
          <Card>
            <SectionHead title="Brand colour" />
            <p className="t-small muted" style={{ marginTop: 0 }}>
              The accent your app and website are painted in. Everything else on
              the theme is structural — the greys are what make a panel look
              raised — so only this one colour is yours to choose.
            </p>
            <div style={{ margin: 'var(--s-lg) 0' }}>
              <ColorPicker
                label="The colour itself"
                presets={BRAND_COLOURS}
                value={chosen}
                onChange={(colour) =>
                  setForm((current) => ({ ...current, themeAccent: colour }))
                }
              />
            </div>

            {/*
              A colour nobody can read a button label on is worth saying out
              loud rather than silently correcting: the shop chose it, and the
              answer is theirs to accept.
            */}
            {!isReadable(chosen) ? (
              <Card size="sm">
                <div className="t-small warning bold">
                  Labels will be hard to read on this
                </div>
                <p className="t-tiny muted" style={{ margin: '2px 0 var(--s-sm)' }}>
                  Neither white nor charcoal stands out on it. {readable} is the nearest
                  shade that works.
                </p>
                <Button
                  title={`Use ${readable}`}
                  variant="dark"
                  onClick={() =>
                    setForm((current) => ({ ...current, themeAccent: readable }))
                  }
                />
              </Card>
            ) : null}
          </Card>

          <Card>
            <SectionHead title="Bank details" />
            <p className="t-small muted" style={{ marginTop: 0 }}>
              Printed under the totals, so the client knows where to send money.
            </p>
            <Field
              label="Account name"
              value={form.bankAccountName ?? ''}
              onChange={set('bankAccountName')}
            />
            <Field
              label="Account number"
              value={form.bankAccountNumber ?? ''}
              onChange={set('bankAccountNumber')}
            />
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <Field
                label="Bank"
                value={form.bankName ?? ''}
                onChange={set('bankName')}
                style={{ flex: 1 }}
              />
              <Field
                label="IFSC"
                value={form.bankIfsc ?? ''}
                onChange={set('bankIfsc')}
                style={{ flex: 1 }}
              />
            </div>
            <Field label="Branch" value={form.bankBranch ?? ''} onChange={set('bankBranch')} />
          </Card>

          <Card>
            <SectionHead title="Letterhead" />
            <p className="t-small muted" style={{ marginTop: 0 }}>
              {profile.data?.letterheadFileId
                ? 'A letterhead is set. Documents are drawn on top of it.'
                : 'No letterhead yet. Documents print with a header built from the details here.'}
            </p>
            <div className="row" style={{ marginTop: 'var(--s-lg)' }}>
              <label className="btn btn-dark btn-sm" style={{ cursor: 'pointer' }}>
                {profile.data?.letterheadFileId ? 'Replace' : 'Upload'}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadLetterhead(file);
                  }}
                />
              </label>
              {profile.data?.letterheadFileId ? (
                <Button
                  title="Remove"
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await api.clearLetterhead();
                    profile.reload();
                  }}
                />
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      <Card style={{ marginTop: 'var(--s-lg)' }}>
        <SectionHead title="Terms & signature" />
        <Field
          label="Terms and conditions"
          hint="One per line. They print as a numbered block."
          value={form.termsAndConditions ?? ''}
          onChange={set('termsAndConditions')}
          multiline
          rows={8}
        />
        <Field
          label="Signatory"
          placeholder="Authorized Signatory"
          value={form.signatoryName ?? ''}
          onChange={set('signatoryName')}
        />
      </Card>

      <div style={{ marginTop: 'var(--s-xl)' }}>
        <Button title="Save firm details" size="lg" loading={busy} onClick={save} />
      </div>
    </>
  );
}
