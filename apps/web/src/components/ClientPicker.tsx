'use client';

import { useEffect, useRef, useState } from 'react';
import type { Client } from '@fas/shared';
import { api } from '@/lib/api';

export interface ClientSelection {
  client?: Client;
  newClient?: { name: string; phone?: string; company?: string };
}

/**
 * Search-as-you-type over the client database, with "create new" built into the
 * same box. The person punching an order is usually on the phone with the
 * client — sending them to a separate screen to add one loses the call.
 */
export function ClientPicker({
  value,
  onChange,
}: {
  value: ClientSelection | null;
  onChange: (selection: ClientSelection | null) => void;
}) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced so a fast typist does not fire a request per keystroke.
  useEffect(() => {
    if (!term.trim() || value?.client) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      api.searchClients(term).then(setResults).catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [term, value?.client]);

  useEffect(() => {
    const onClickAway = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  if (value?.client) {
    return (
      <div className="field">
        <label>Client</label>
        <div className="row" style={{ alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <strong>{value.client.name}</strong>{' '}
            <span className="muted">{value.client.code}</span>
            {value.client.phone ? <div className="muted">{value.client.phone}</div> : null}
          </div>
          <button type="button" onClick={() => { onChange(null); setTerm(''); }}>
            Change
          </button>
        </div>
      </div>
    );
  }

  if (creating) {
    return (
      <div className="field">
        <label>New client</label>
        <div className="field-row">
          <input
            placeholder="Client name"
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              onChange({ newClient: { name: e.target.value, phone: newPhone } });
            }}
            autoFocus
          />
          <input
            placeholder="Phone"
            value={newPhone}
            onChange={(e) => {
              setNewPhone(e.target.value);
              onChange({ newClient: { name: term, phone: e.target.value } });
            }}
          />
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          If this phone number already belongs to a client, the order attaches to them
          instead of creating a duplicate.
        </p>
        <button type="button" onClick={() => { setCreating(false); onChange(null); }}>
          Search instead
        </button>
      </div>
    );
  }

  return (
    <div className="field combo" ref={boxRef}>
      <label htmlFor="client">Client</label>
      <input
        id="client"
        placeholder="Type a name or phone…"
        value={term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && term.trim() ? (
        <div className="combo-list">
          {results.map((client) => (
            <div
              key={client.id}
              className="combo-item"
              onClick={() => { onChange({ client }); setOpen(false); }}>
              {client.name}
              <small>
                {client.code}
                {client.phone ? ` · ${client.phone}` : ''}
                {client.company ? ` · ${client.company}` : ''}
              </small>
            </div>
          ))}
          <div
            className="combo-item"
            onClick={() => {
              setCreating(true);
              setOpen(false);
              onChange({ newClient: { name: term, phone: newPhone } });
            }}>
            <strong>+ Create “{term}”</strong>
            <small>Add a new client without leaving this screen</small>
          </div>
        </div>
      ) : null}
    </div>
  );
}
