import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import {
  PickedContact,
  loadContacts,
  requestContactsAccess,
} from '../lib/contacts';
import { Avatar, Button, Card, EmptyState, Field, Loader, Sheet, Text } from '../ui';
import { spacing } from '../theme';

/**
 * Pick someone out of the phone's address book.
 *
 * Opened only on an explicit tap, and the list never leaves the device — the
 * one contact chosen is the only thing that becomes a client. Filtering happens
 * here rather than on a server for the same reason.
 */
export function ContactPickerSheet({
  visible,
  onClose,
  onPick,
  title = 'Pick from contacts',
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (contact: PickedContact) => void;
  title?: string;
}) {
  const [contacts, setContacts] = useState<PickedContact[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    (async () => {
      setDenied(false);
      setContacts(null);
      const allowed = await requestContactsAccess();
      if (cancelled) return;
      if (!allowed) return setDenied(true);
      try {
        const loaded = await loadContacts();
        if (!cancelled) setContacts(loaded);
      } catch (e) {
        if (!cancelled) {
          Alert.alert('Could not read contacts', e instanceof Error ? e.message : 'Unknown error');
          onClose();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, onClose]);

  const filtered = useMemo(() => {
    if (!contacts) return [];
    const term = search.trim().toLowerCase();
    if (!term) return contacts.slice(0, 120);

    // Only match on the number when the term actually has digits in it. An
    // empty digit string is contained in every phone number, so searching a
    // name used to return the whole address book.
    const digits = term.replace(/[^\d]/g, '');

    return contacts
      .filter(
        (contact) =>
          contact.name.toLowerCase().includes(term) ||
          (digits.length > 0 && (contact.phone ?? '').includes(digits)),
      )
      .slice(0, 120);
  }, [contacts, search]);

  return (
    <Sheet visible={visible} title={title} onClose={onClose} fullHeight>
      {denied ? (
        <View>
          <EmptyState
            icon="users"
            title="Contacts are off"
            message="Allow contacts and the client's name and number fill themselves in."
          />
          <Button
            title="Open settings"
            variant="dark"
            onPress={() => Linking.openSettings()}
          />
        </View>
      ) : !contacts ? (
        <Loader label="Reading your contacts" />
      ) : (
        <>
          <Field
            placeholder="Name or number"
            value={search}
            onChangeText={setSearch}
            icon="search"
            autoFocus
            pasteable={false}
          />
          {filtered.length === 0 ? (
            <EmptyState icon="users" title="Nobody matches" />
          ) : (
            filtered.map((contact) => (
              <Card
                key={contact.id}
                tone="dark"
                style={styles.row}
                onPress={() => {
                  onPick(contact);
                  onClose();
                }}>
                <Avatar name={contact.name} size={38} tone="dark" />
                <View style={{ flex: 1, marginLeft: spacing.md, minWidth: 0 }}>
                  <Text variant="body" bold numberOfLines={1}>{contact.name}</Text>
                  <Text variant="tiny" tone="muted" numberOfLines={1}>
                    {contact.phone}
                    {contact.company ? ` · ${contact.company}` : ''}
                  </Text>
                </View>
              </Card>
            ))
          )}
          {contacts.length > filtered.length ? (
            <Text variant="tiny" tone="faint" style={styles.more}>
              Showing {filtered.length} of {contacts.length}. Search to narrow it.
            </Text>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  more: { textAlign: 'center', paddingVertical: spacing.md },
});
