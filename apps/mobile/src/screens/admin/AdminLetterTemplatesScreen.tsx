import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { LetterKind, LetterTemplate } from '@decor/shared';
import {
  LETTER_FIELDS,
  LETTER_FIELD_LABELS,
  LETTER_HINTS,
  LETTER_KINDS,
  LETTER_LABELS,
  unknownPlaceholders,
} from '@decor/shared';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import {
  Button,
  Card,
  Chip,
  Field,
  Icon,
  Loader,
  Pill,
  Screen,
  ScreenHeader,
  Select,
  Sheet,
  Text,
  haptic,
} from '../../ui';
import { palette, spacing } from '../../theme';

/**
 * What each letter says, before it is about anybody.
 *
 * The words are the shop's. The placeholders in double braces are filled in
 * when a letter is issued — and a placeholder nothing can fill is called out
 * here, because braces printed on a page somebody hands to a bank is the sort
 * of mistake nobody notices until it has happened.
 */
export function AdminLetterTemplatesScreen({ navigation }: { navigation: any }) {
  const templates = useApi<LetterTemplate[]>(() => api.letterTemplates(), []);

  const [editing, setEditing] = useState<LetterTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<LetterKind>('OFFER');
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const open = (template: LetterTemplate | null) => {
    setEditing(template);
    setCreating(template === null);
    setKind(template?.kind ?? 'OFFER');
    setName(template?.name ?? '');
    setBody(template?.body ?? '');
  };

  const close = () => {
    setEditing(null);
    setCreating(false);
  };

  const save = async () => {
    setBusy(true);
    try {
      const payload = { kind, name: name.trim(), body };
      if (editing) await api.updateLetterTemplate(editing.id, payload);
      else await api.createLetterTemplate(payload);
      haptic('notificationSuccess');
      close();
      templates.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (!templates.data) return <Loader label="Loading" />;
  const unknown = unknownPlaceholders(body);

  return (
    <Screen refreshing={templates.refreshing} onRefresh={templates.refresh}>
      <ScreenHeader
        title="Letter templates"
        subtitle="What each letter says, in your words"
        onBack={() => navigation.goBack()}
      />

      <Button
        title="New template"
        icon={<Icon name="plus" size={17} color={palette.textOnAccent} />}
        onPress={() => open(null)}
        style={{ marginBottom: spacing.lg }}
      />

      {templates.data.map((template, index) => (
        <Animated.View
          key={template.id}
          entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(300)}>
          <Card tone="dark" style={styles.card} onPress={() => open(template)}>
            <View style={styles.head}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="h3">{template.name}</Text>
                <Text variant="tiny" tone="muted">{LETTER_LABELS[template.kind]}</Text>
              </View>
              {template.isActive ? null : (
                <Pill label="Hidden" color={palette.textFaint} small />
              )}
            </View>
          </Card>
        </Animated.View>
      ))}

      <Sheet
        visible={Boolean(editing) || creating}
        title={creating ? 'New template' : (editing?.name ?? '')}
        subtitle={LETTER_HINTS[kind]}
        onClose={close}>
        <Select
          label="Which letter"
          value={kind}
          options={LETTER_KINDS.map((key) => ({ value: key, label: LETTER_LABELS[key] }))}
          onChange={(value) => setKind(value as LetterKind)}
        />
        <Field label="Called" value={name} onChangeText={setName} />
        <Field
          label="What it says"
          testID="template-body"
          value={body}
          onChangeText={setBody}
          multiline
        />

        <Text variant="tiny" tone="muted" style={styles.hint}>
          Tap to drop one of these in. They are filled in when a letter is issued.
        </Text>
        <View style={styles.chips}>
          {LETTER_FIELDS.map((field) => (
            <Chip
              key={field}
              label={LETTER_FIELD_LABELS[field]}
              onPress={() => setBody((current) => `${current}{{${field}}}`)}
            />
          ))}
        </View>

        {unknown.length > 0 ? (
          <Text variant="small" style={styles.warning}>
            Nothing will fill in {unknown.map((one) => `{{${one}}}`).join(', ')} — it will
            print as it is.
          </Text>
        ) : null}

        <Button
          title="Save"
          loading={busy}
          disabled={name.trim().length < 2 || body.trim().length < 20}
          onPress={save}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  hint: { marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  warning: { color: palette.warning, marginBottom: spacing.md },
});
