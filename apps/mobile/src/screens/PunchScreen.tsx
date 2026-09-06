import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInRight,
  FadeOut,
  Layout,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import type { Client, LengthUnit, Material, SizePreset } from '@decor/shared';
import { LENGTH_UNITS, UNIT_LABEL, fromMm, parseLengthToMm, toMm } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useDisplayUnit } from '../hooks/useUnit';
import {
  Avatar,
  Button,
  Card,
  Chip,
  Field,
  HoldButton,
  Icon,
  Keypad,
  Loader,
  Screen,
  ScreenHeader,
  Sheet,
  SheetOption,
  Text,
  haptic,
} from '../ui';
import { motion, palette, radius, spacing } from '../theme';

type Step = 'client' | 'size' | 'material' | 'confirm';
const STEPS: Step[] = ['client', 'size', 'material', 'confirm'];
const STEP_TITLE: Record<Step, string> = {
  client: 'Who is it for?',
  size: 'What size?',
  material: 'In what material?',
  confirm: 'Check and punch',
};

/**
 * Punching an order, as four short questions rather than one long form.
 *
 * The person doing this is usually on the phone or standing at a site. Each
 * step asks one thing, keeps the answer visible once given, and the whole
 * commit is a deliberate hold at the end.
 */
export function PunchScreen({ navigation }: { navigation: any }) {
  const [unit, setUnit] = useDisplayUnit();
  const [step, setStep] = useState<Step>('client');

  const materials = useApi<Material[]>(() => api.materials(), []);
  const presets = useApi<SizePreset[]>(() => api.sizePresets(), []);

  // client
  const [client, setClient] = useState<Client | null>(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [location, setLocation] = useState('');
  const [clientSheet, setClientSheet] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Client[]>([]);

  // size
  const [active, setActive] = useState<'length' | 'width'>('length');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [presetSheet, setPresetSheet] = useState(false);

  // material
  const [materialId, setMaterialId] = useState('');
  const [thicknessId, setThicknessId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');

  const [busy, setBusy] = useState(false);

  const material = materials.data?.find((m) => m.id === materialId);
  const lengthMm = parseLengthToMm(length, unit);
  const widthMm = parseLengthToMm(width, unit);

  const stepIndex = STEPS.indexOf(step);
  const canContinue = useMemo(() => {
    switch (step) {
      case 'client':
        return Boolean((client || newName.trim()) && location.trim());
      case 'size':
        return lengthMm !== null && widthMm !== null && lengthMm > 0 && widthMm > 0;
      case 'material':
        return Boolean(materialId);
      default:
        return true;
    }
  }, [step, client, newName, location, lengthMm, widthMm, materialId]);

  const runSearch = (term: string) => {
    setSearch(term);
    if (!term.trim()) {
      setResults([]);
      return;
    }
    api.searchClients(term).then(setResults).catch(() => setResults([]));
  };

  const type = (key: string) => {
    const setter = active === 'length' ? setLength : setWidth;
    const current = active === 'length' ? length : width;
    if (key === '.' && current.includes('.')) return;
    setter(current + key);
  };

  const backspace = () => {
    const setter = active === 'length' ? setLength : setWidth;
    const current = active === 'length' ? length : width;
    setter(current.slice(0, -1));
  };

  const applyPreset = (preset: SizePreset) => {
    setLength(String(fromMm(Number(preset.lengthMm), unit)));
    setWidth(String(fromMm(Number(preset.widthMm), unit)));
    setPresetSheet(false);
    haptic('impactLight');
  };

  const submit = async () => {
    if (lengthMm === null || widthMm === null || !materialId) return;
    setBusy(true);
    try {
      const order = await api.punchOrder({
        clientId: client?.id,
        newClient: client ? undefined : { name: newName.trim(), phone: newPhone || undefined },
        location: location.trim(),
        notes: notes || undefined,
        items: [
          {
            length: { value: lengthMm, unit: 'MM' },
            width: { value: widthMm, unit: 'MM' },
            materialId,
            materialThicknessId: thicknessId || undefined,
            quantity: Number(quantity || 1),
          },
        ],
      });
      navigation.navigate('OrderDetail', { orderId: order.id, justPunched: true });
      reset();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not punch', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStep('client');
    setClient(null);
    setNewName('');
    setNewPhone('');
    setLocation('');
    setLength('');
    setWidth('');
    setMaterialId('');
    setThicknessId('');
    setQuantity('1');
    setNotes('');
  };

  if (materials.loading && !materials.data) return <Loader label="Loading materials" />;

  return (
    <Screen scroll={step !== 'size'}>
      <ScreenHeader
        title="Punch order"
        subtitle={STEP_TITLE[step]}
        onBack={stepIndex > 0 ? () => setStep(STEPS[stepIndex - 1]) : undefined}
      />

      <StepDots count={STEPS.length} index={stepIndex} />

      {step === 'client' ? (
        <Animated.View entering={FadeInRight.duration(motion.base)} exiting={FadeOut.duration(120)}>
          {client ? (
            <Card tone="accent" style={styles.clientCard}>
              <Avatar name={client.name} size={46} tone="dark" />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text variant="h3" tone="onAccent">{client.name}</Text>
                <Text variant="tiny" tone="onAccent" style={{ opacity: 0.7 }}>
                  {client.code}{client.phone ? ` · ${client.phone}` : ''}
                </Text>
              </View>
              <Pressable onPress={() => setClient(null)} hitSlop={8}>
                <Icon name="close" size={18} color={palette.textOnAccent} />
              </Pressable>
            </Card>
          ) : (
            <>
              <Pressable onPress={() => setClientSheet(true)}>
                <Card tone="dark" style={styles.searchCard}>
                  <Icon name="search" size={19} color={palette.textMuted} />
                  <Text variant="body" tone="faint" style={{ flex: 1, marginLeft: spacing.md }}>
                    Search existing clients
                  </Text>
                  <Icon name="chevronRight" size={16} color={palette.textMuted} />
                </Card>
              </Pressable>

              <Text variant="label" tone="faint" style={styles.orLabel}>or add a new one</Text>

              <Field
                label="Client name"
                placeholder="Who is ordering?"
                value={newName}
                onChangeText={setNewName}
                icon="user"
              />
              <Field
                label="Phone"
                placeholder="Optional — matches an existing client"
                value={newPhone}
                onChangeText={setNewPhone}
                keyboardType="phone-pad"
                icon="phone"
                hint="If this number is already on file, the order attaches to them."
              />
            </>
          )}

          <Field
            label="Location"
            placeholder="Site or address"
            value={location}
            onChangeText={setLocation}
            icon="pin"
          />
        </Animated.View>
      ) : null}

      {step === 'size' ? (
        <Animated.View entering={FadeInRight.duration(motion.base)} style={{ flex: 1 }}>
          <View style={styles.sizeDisplay}>
            <SizeSlot
              label="Length"
              value={length}
              unit={unit}
              active={active === 'length'}
              onPress={() => setActive('length')}
            />
            <Text variant="h1" tone="faint" style={{ marginHorizontal: spacing.md }}>×</Text>
            <SizeSlot
              label="Width"
              value={width}
              unit={unit}
              active={active === 'width'}
              onPress={() => setActive('width')}
            />
          </View>

          <Text variant="tiny" tone="faint" style={styles.mmHint}>
            {lengthMm !== null && widthMm !== null
              ? `stored as ${lengthMm} × ${widthMm} mm`
              : 'millimetres are what get stored'}
          </Text>

          <View style={styles.unitRow}>
            {LENGTH_UNITS.map((u) => (
              <Chip
                key={u}
                label={UNIT_LABEL[u]}
                selected={unit === u}
                onPress={() => {
                  // Convert what is already typed so the number keeps meaning
                  // the same thing when the unit changes.
                  if (lengthMm !== null) setLength(String(fromMm(lengthMm, u)));
                  if (widthMm !== null) setWidth(String(fromMm(widthMm, u)));
                  setUnit(u);
                  haptic('impactLight');
                }}
              />
            ))}
            <Chip label="Presets" onPress={() => setPresetSheet(true)} />
          </View>

          <View style={{ flex: 1 }} />
          <Keypad
            onKey={type}
            onBackspace={backspace}
            onClear={() => (active === 'length' ? setLength('') : setWidth(''))}
          />
        </Animated.View>
      ) : null}

      {step === 'material' ? (
        <Animated.View entering={FadeInRight.duration(motion.base)}>
          <Text variant="label" tone="muted" style={{ marginBottom: spacing.md }}>Material</Text>
          <View style={styles.chipWrap}>
            {materials.data?.map((m) => (
              <Chip
                key={m.id}
                label={m.name}
                accent={m.color}
                selected={materialId === m.id}
                onPress={() => {
                  setMaterialId(m.id);
                  setThicknessId('');
                  haptic('impactLight');
                }}
              />
            ))}
          </View>

          {material ? (
            <Animated.View entering={FadeIn.duration(motion.base)} layout={Layout.springify()}>
              <Text variant="label" tone="muted" style={styles.blockLabel}>Thickness</Text>
              <View style={styles.chipWrap}>
                {material.thicknesses.map((t) => (
                  <Chip
                    key={t.id}
                    label={t.label ?? `${Number(t.valueMm)} mm`}
                    selected={thicknessId === t.id}
                    onPress={() => {
                      setThicknessId(thicknessId === t.id ? '' : t.id);
                      haptic('impactLight');
                    }}
                  />
                ))}
              </View>
            </Animated.View>
          ) : null}

          <View style={styles.qtyRow}>
            <Field
              label="Quantity"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="number-pad"
              containerStyle={{ flex: 1, marginRight: spacing.md }}
            />
            <Field
              label="Notes"
              placeholder="Optional"
              value={notes}
              onChangeText={setNotes}
              containerStyle={{ flex: 2 }}
            />
          </View>
        </Animated.View>
      ) : null}

      {step === 'confirm' ? (
        <Animated.View entering={FadeInRight.duration(motion.base)}>
          <Card tone="accent">
            <Text variant="label" tone="onAccent" style={{ opacity: 0.7 }}>Punching</Text>
            <Text variant="display" tone="onAccent" style={{ marginTop: 2 }}>
              {length} × {width}
            </Text>
            <Text variant="body" tone="onAccent" style={{ opacity: 0.8 }}>
              {UNIT_LABEL[unit]} · {material?.name}
              {thicknessId
                ? ` · ${material?.thicknesses.find((t) => t.id === thicknessId)?.label ??
                    `${Number(material?.thicknesses.find((t) => t.id === thicknessId)?.valueMm)} mm`}`
                : ''}
            </Text>
            <View style={styles.confirmMeta}>
              <Text variant="small" tone="onAccent" style={{ opacity: 0.75 }}>
                {client?.name ?? newName} · {location}
              </Text>
              <Text variant="small" tone="onAccent" bold>× {quantity}</Text>
            </View>
          </Card>

          <Card tone="dark" style={{ marginTop: spacing.md }}>
            <Row label="Stored size" value={`${lengthMm} × ${widthMm} mm`} />
            <Row label="Client" value={client ? `${client.name} (existing)` : `${newName} (new)`} />
            <Row label="Location" value={location} />
            {notes ? <Row label="Notes" value={notes} /> : null}
          </Card>

          <View style={{ marginTop: spacing.xl }}>
            <HoldButton title="Hold to punch" onComplete={submit} disabled={busy} />
          </View>
          <Text variant="tiny" tone="faint" style={styles.holdHint}>
            Press and hold — this creates a real order.
          </Text>
        </Animated.View>
      ) : null}

      {step !== 'confirm' ? (
        <Button
          title="Continue"
          size="lg"
          disabled={!canContinue}
          onPress={() => setStep(STEPS[stepIndex + 1])}
          style={{ marginTop: spacing.xl }}
        />
      ) : null}

      <Sheet
        visible={clientSheet}
        title="Find a client"
        subtitle="Search by name, phone or code"
        onClose={() => setClientSheet(false)}
        fullHeight>
        <Field
          placeholder="Type to search…"
          value={search}
          onChangeText={runSearch}
          icon="search"
          autoFocus
        />
        {results.map((result) => (
          <SheetOption
            key={result.id}
            label={result.name}
            description={`${result.code}${result.phone ? ` · ${result.phone}` : ''}`}
            onPress={() => {
              setClient(result);
              setClientSheet(false);
              setSearch('');
              setResults([]);
              if (result.locations?.[0] && !location) setLocation(result.locations[0].name);
              haptic('impactLight');
            }}
          />
        ))}
        {search.trim() && results.length === 0 ? (
          <Text variant="small" tone="faint" style={{ textAlign: 'center', paddingVertical: 20 }}>
            No match. Close this and add them as a new client.
          </Text>
        ) : null}
      </Sheet>

      <Sheet
        visible={presetSheet}
        title="Size presets"
        subtitle="Configured by your admin"
        onClose={() => setPresetSheet(false)}>
        {presets.data?.map((preset) => (
          <SheetOption
            key={preset.id}
            label={preset.name}
            description={`${fromMm(Number(preset.lengthMm), unit)} × ${fromMm(
              Number(preset.widthMm),
              unit,
            )} ${UNIT_LABEL[unit]}`}
            onPress={() => applyPreset(preset)}
          />
        ))}
      </Sheet>
    </Screen>
  );
}

function SizeSlot({
  label,
  value,
  unit,
  active,
  onPress,
}: {
  label: string;
  value: string;
  unit: LengthUnit;
  active: boolean;
  onPress: () => void;
}) {
  const glow = useSharedValue(active ? 1 : 0);
  glow.value = withSpring(active ? 1 : 0, motion.spring);

  const style = useAnimatedStyle(() => ({
    borderColor: glow.value > 0.5 ? palette.accent : 'rgba(0,0,0,0.28)',
    transform: [{ scale: 0.97 + glow.value * 0.03 }],
  }));

  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      <Animated.View style={[styles.slot, style]}>
        <Text variant="label" tone={active ? 'accent' : 'faint'}>{label}</Text>
        <Text
          variant="h1"
          tone={value ? 'default' : 'faint'}
          numberOfLines={1}
          adjustsFontSizeToFit>
          {value || '0'}
        </Text>
        <Text variant="tiny" tone="muted">{UNIT_LABEL[unit]}</Text>
      </Animated.View>
    </Pressable>
  );
}

function StepDots({ count, index }: { count: number; index: number }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === index && styles.dotActive,
            i < index && styles.dotDone,
          ]}
        />
      ))}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text variant="small" tone="muted">{label}</Text>
      <Text variant="small" bold style={{ flex: 1, textAlign: 'right' }} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 6, marginBottom: spacing.xl, justifyContent: 'center' },
  dot: { width: 22, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.28)' },
  dotActive: { backgroundColor: palette.accent, width: 30 },
  dotDone: { backgroundColor: palette.accentDeep },
  clientCard: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  searchCard: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg },
  orLabel: { textAlign: 'center', marginVertical: spacing.lg },
  sizeDisplay: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  slot: {
    borderWidth: 1.5,
    borderRadius: radius.xl,
    backgroundColor: palette.surface,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  mmHint: { textAlign: 'center', marginTop: spacing.md },
  unitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  blockLabel: { marginTop: spacing.xl, marginBottom: spacing.md },
  qtyRow: { flexDirection: 'row', marginTop: spacing.xl },
  confirmMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
  holdHint: { textAlign: 'center', marginTop: spacing.md },
});
