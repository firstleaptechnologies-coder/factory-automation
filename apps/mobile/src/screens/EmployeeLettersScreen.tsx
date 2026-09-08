import React, { useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Employee, Letter, LetterTemplate } from '@decor/shared';
import { LETTER_LABELS, PERMISSIONS, today } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../auth/AuthContext';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Loader,
  RoundButton,
  Screen,
  ScreenHeader,
  Select,
  Sheet,
  Text,
  haptic,
} from '../ui';
import { spacing } from '../theme';
import { formatDateShort } from '../lib/format';

/**
 * The letters one person has been given.
 *
 * The body is drafted from a template on the server, shown here to be read and
 * changed, and then filed as it stands. What is kept is the words that were
 * handed over — a template edited next year must not change what is in
 * somebody's file from last March.
 */
export function EmployeeLettersScreen({ navigation, route }: { navigation: any; route: any }) {
  const employeeId: string = route.params.id;
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

  const canManage = can(PERMISSIONS.EMPLOYEE_MANAGE);

  /** Pulls the wording, filled in for this person, off the server. */
  const pickTemplate = async (id: string) => {
    setTemplateId(id);
    try {
      const draft = await api.letterDraft(id, employeeId);
      setTitle(draft.title);
      setBody(draft.body);
    } catch (e) {
      Alert.alert('Could not draft it', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const issue = async () => {
    const template = templates.data?.find((one) => one.id === templateId);
    if (!template) return;

    setBusy(true);
    try {
      await api.issueLetter({
        employeeId,
        kind: template.kind,
        title: title.trim(),
        body,
        issuedOn,
      });
      haptic('notificationSuccess');
      setWriting(false);
      setTemplateId(null);
      setBody('');
      letters.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not file it', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (letters.loading && !letters.data) return <Loader label="Loading" />;
  const rows = letters.data ?? [];

  return (
    <Screen refreshing={letters.refreshing} onRefresh={letters.refresh}>
      <ScreenHeader
        title="Letters"
        subtitle={employee.data?.name ?? ''}
        onBack={() => navigation.goBack()}
        right={
          canManage ? (
            <RoundButton icon="plus" testID="write-letter" onPress={() => setWriting(true)} />
          ) : null
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon="clipboard" title="No letters yet" />
      ) : (
        rows.map((letter, index) => (
          <Animated.View
            key={letter.id}
            entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(300)}>
            <Card
              tone="dark"
              style={styles.row}
              onPress={() => Linking.openURL(api.letterDocumentUrl(letter.id))}>
              <View style={styles.rowTop}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="h3" numberOfLines={1}>{letter.title}</Text>
                  <Text variant="tiny" tone="muted">
                    {LETTER_LABELS[letter.kind]} · {formatDateShort(letter.issuedOn)}
                  </Text>
                </View>
              </View>
            </Card>
          </Animated.View>
        ))
      )}

      <Sheet
        visible={writing}
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
        <Field label="Heading" value={title} onChangeText={setTitle} />
        <Field
          label="What it says"
          testID="letter-body"
          value={body}
          onChangeText={setBody}
          multiline
        />
        <Field label="Dated" placeholder="YYYY-MM-DD" value={issuedOn} onChangeText={setIssuedOn} />
        <Button
          title="File it"
          loading={busy}
          disabled={!templateId || body.trim().length < 20}
          onPress={issue}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
