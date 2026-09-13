import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Client } from '@fas/shared';
import { api } from '../api/client';
import { Avatar, Card, Field, Icon, Sheet, SheetOption, Text, haptic } from '../ui';
import { palette, spacing } from '../theme';

/**
 * What a screen knows about who the work is for.
 *
 * Two states in one value, deliberately: somebody already on file, or the name
 * and phone being typed for somebody who is not. Screens hold this rather than
 * a loose `clientId` beside a loose `clientName`, which is how the two drifted
 * apart — typing over a chosen client used to leave the id pointing at a
 * record the name no longer matched.
 */
export type ClientChoice = {
  /**
   * The client that was picked. Widened from `Client` because a screen opened
   * from an enquiry knows the id and the name and nothing else, and a round
   * trip to fill in the rest before the screen can draw is a round trip the
   * person is waiting on.
   */
  client: (Partial<Client> & { id: string; name: string }) | null;
  /** Typed in for a client who is not on file yet. */
  name: string;
  phone: string;
};

/** Nobody chosen and nothing typed. */
export const NO_CLIENT: ClientChoice = { client: null, name: '', phone: '' };

/** An existing client, ready to use as a starting point. */
export function pickedClient(client: ClientChoice['client']): ClientChoice {
  return { client, name: '', phone: '' };
}

/** A name with nobody behind it — a quote loaded from before this existed. */
export function typedClient(name: string, phone = ''): ClientChoice {
  return { client: null, name, phone };
}

/** Whether there is enough here to attach an order or a quote to somebody. */
export function hasClient(choice: ClientChoice): boolean {
  return Boolean(choice.client || choice.name.trim());
}

/** Who it is, however it was filled in. */
export function clientLabel(choice: ClientChoice): string {
  return choice.client?.name ?? choice.name.trim();
}

/**
 * What the API is sent.
 *
 * Exactly one of the two: an id the shop already has, or the client to create.
 * Both the punch and the quote endpoints resolve `newClient` through the same
 * rule, so a phone number already on file attaches rather than duplicating.
 */
export function clientRef(choice: ClientChoice): {
  clientId?: string;
  newClient?: { name: string; phone?: string };
} {
  if (choice.client) return { clientId: choice.client.id };
  const name = choice.name.trim();
  if (!name) return {};
  return { newClient: { name, phone: choice.phone.trim() || undefined } };
}

/**
 * The one way a client is filled in, on every screen that asks for one.
 *
 * Search what the shop already has; add somebody who is not there yet without
 * leaving the screen. It was three different controls before — one that could
 * only search, one that could only be typed into, and the punch screen's,
 * which could do both — so the same customer got entered three ways and the
 * ledger carried three of them.
 *
 * `allowCreate` is off where the client is a subject rather than a party: a
 * report about a client nobody has traded with has nothing to report.
 */
export function ClientPicker({
  value,
  onChange,
  allowCreate = true,
  onPick,
  nameLabel = 'Client name',
  namePlaceholder = 'Who is it for?',
}: {
  value: ClientChoice;
  onChange: (choice: ClientChoice) => void;
  allowCreate?: boolean;
  /** Extra work when an existing client is chosen — prefilling an address. */
  onPick?: (client: Client) => void;
  nameLabel?: string;
  namePlaceholder?: string;
}) {
  const [sheet, setSheet] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Client[]>([]);

  /*
   * Debounced, and the reply from a search that has been typed past is thrown
   * away: a fast typist firing one request per keystroke used to let "ver"
   * land after "verma" and put the wrong list under their finger.
   */
  useEffect(() => {
    const term = search.trim();
    if (!term) {
      setResults([]);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      api
        .searchClients(term)
        .then((found) => live && setResults(found))
        .catch(() => live && setResults([]));
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [search]);

  const close = () => {
    setSheet(false);
    setSearch('');
    setResults([]);
  };

  return (
    <>
      {value.client ? (
        <Card tone="accent" style={styles.picked}>
          <Avatar name={value.client.name} size={46} tone="dark" />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text variant="h3" tone="onAccent">{value.client.name}</Text>
            <Text variant="tiny" tone="onAccent" style={{ opacity: 0.7 }}>
              {[value.client.code, value.client.phone].filter(Boolean).join(' · ') || 'On file'}
            </Text>
          </View>
          <Pressable
            onPress={() => onChange(NO_CLIENT)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear the client">
            <Icon name="close" size={18} color={palette.textOnAccent} />
          </Pressable>
        </Card>
      ) : (
        <>
          <Pressable
            onPress={() => setSheet(true)}
            accessibilityRole="button"
            accessibilityLabel="Search existing clients">
            <Card tone="dark" style={styles.search}>
              <Icon name="search" size={19} color={palette.textMuted} />
              <Text variant="body" tone="faint" style={{ flex: 1, marginLeft: spacing.md }}>
                Search existing clients
              </Text>
              <Icon name="chevronRight" size={16} color={palette.textMuted} />
            </Card>
          </Pressable>

          {allowCreate ? (
            <>
              <Text variant="label" tone="faint" style={styles.or}>or add a new one</Text>
              <Field
                label={nameLabel}
                placeholder={namePlaceholder}
                value={value.name}
                onChangeText={(name) => onChange({ ...value, name })}
                icon="user"
              />
              <Field
                label="Phone"
                placeholder="Optional — matches an existing client"
                value={value.phone}
                onChangeText={(phone) => onChange({ ...value, phone })}
                keyboardType="phone-pad"
                icon="phone"
                hint="If this number is already on file, it attaches to them."
              />
            </>
          ) : null}
        </>
      )}

      <Sheet
        visible={sheet}
        title="Find a client"
        subtitle="Search by name, phone or code"
        onClose={close}
        fullHeight>
        <Field
          placeholder="Type to search…"
          value={search}
          onChangeText={setSearch}
          icon="search"
          pasteable={false}
          autoFocus
        />
        {results.map((result) => (
          <SheetOption
            key={result.id}
            label={result.name}
            description={[result.code, result.phone].filter(Boolean).join(' · ')}
            selected={value.client?.id === result.id}
            onPress={() => {
              onChange(pickedClient(result));
              onPick?.(result);
              close();
              haptic('impactLight');
            }}
          />
        ))}
        {search.trim() && results.length === 0 ? (
          <Text variant="small" tone="faint" style={styles.none}>
            {allowCreate
              ? 'No match. Close this and add them as a new client.'
              : 'No match. Only clients the shop has on file can be reported on.'}
          </Text>
        ) : null}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  picked: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  search: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg },
  or: { textAlign: 'center', marginVertical: spacing.lg },
  none: { textAlign: 'center', paddingVertical: 20 },
});
