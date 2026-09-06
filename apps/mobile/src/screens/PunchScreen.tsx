import React, {useEffect, useState} from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type {Client, LengthUnit, Material} from '@decor/shared';
import {LENGTH_UNITS, UNIT_LABEL, parseLengthToMm} from '@decor/shared';
import {api} from '../api/client';
import {Button, Card, Loader} from '../components/ui';
import {colors, font, radius, spacing} from '../theme';

/**
 * Punching from the shop floor or a site visit.
 *
 * Same rules as the web form: the client can be found or created inline, and
 * sizes accept whatever the tape says — "8", "8' 6\"", "2440mm" — resolving to
 * millimetres before anything is sent.
 */
export function PunchScreen({navigation}: {navigation: any}) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [ready, setReady] = useState(false);

  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Client[]>([]);
  const [client, setClient] = useState<Client | null>(null);
  const [newPhone, setNewPhone] = useState('');

  const [location, setLocation] = useState('');
  const [unit, setUnit] = useState<LengthUnit>('FT');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [thicknessId, setThicknessId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .materials()
      .then(setMaterials)
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!term.trim() || client) return;
    const timer = setTimeout(() => {
      api.searchClients(term).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [term, client]);

  const lengthMm = parseLengthToMm(length, unit);
  const widthMm = parseLengthToMm(width, unit);
  const material = materials.find(m => m.id === materialId);

  const submit = async () => {
    if (!client && !term.trim()) {
      Alert.alert('Client required', 'Search for a client or type a new name.');
      return;
    }
    if (!location.trim()) {
      Alert.alert('Location required', 'Enter the site or address.');
      return;
    }
    if (lengthMm === null || widthMm === null) {
      Alert.alert('Size unreadable', 'Enter a length and width I can read.');
      return;
    }
    if (!materialId) {
      Alert.alert('Material required', 'Pick a material.');
      return;
    }

    setBusy(true);
    try {
      const order = await api.punchOrder({
        clientId: client?.id,
        newClient: client ? undefined : {name: term.trim(), phone: newPhone || undefined},
        location: location.trim(),
        items: [
          {
            length: {value: lengthMm, unit: 'MM'},
            width: {value: widthMm, unit: 'MM'},
            materialId,
            materialThicknessId: thicknessId || undefined,
            quantity: Number(quantity || 1),
          },
        ],
      });
      navigation.navigate('OrderDetail', {orderId: order.id});
    } catch (e) {
      Alert.alert('Could not punch', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return <Loader />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.cardTitle}>Client</Text>
        {client ? (
          <View style={styles.selected}>
            <View style={{flex: 1}}>
              <Text style={styles.selectedName}>{client.name}</Text>
              <Text style={styles.meta}>{client.code}{client.phone ? ` · ${client.phone}` : ''}</Text>
            </View>
            <Button
              title="Change"
              variant="ghost"
              style={styles.smallButton}
              onPress={() => {
                setClient(null);
                setTerm('');
              }}
            />
          </View>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="Search a name or phone, or type a new one"
              placeholderTextColor={colors.textMuted}
              value={term}
              onChangeText={setTerm}
            />
            {results.map(result => (
              <TouchableOpacity
                key={result.id}
                style={styles.result}
                onPress={() => {
                  setClient(result);
                  setResults([]);
                }}>
                <Text style={styles.resultName}>{result.name}</Text>
                <Text style={styles.meta}>
                  {result.code}{result.phone ? ` · ${result.phone}` : ''}
                </Text>
              </TouchableOpacity>
            ))}
            {term.trim() && results.length === 0 ? (
              <TextInput
                style={styles.input}
                placeholder="Phone for the new client"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                value={newPhone}
                onChangeText={setNewPhone}
              />
            ) : null}
          </>
        )}

        <TextInput
          style={styles.input}
          placeholder="Location / site"
          placeholderTextColor={colors.textMuted}
          value={location}
          onChangeText={setLocation}
        />
      </Card>

      <Card>
        <View style={styles.unitRow}>
          <Text style={styles.cardTitle}>Size</Text>
          <View style={{flex: 1}} />
          {LENGTH_UNITS.map(u => (
            <TouchableOpacity
              key={u}
              onPress={() => setUnit(u)}
              style={[styles.unitChip, unit === u && styles.unitChipActive]}>
              <Text style={[styles.unitText, unit === u && styles.unitTextActive]}>
                {UNIT_LABEL[u]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          style={styles.input}
          placeholder={`Length — e.g. 8 or 8' 6"`}
          placeholderTextColor={colors.textMuted}
          value={length}
          onChangeText={setLength}
        />
        <Text style={styles.hint}>{lengthMm !== null ? `= ${lengthMm} mm` : ' '}</Text>

        <TextInput
          style={styles.input}
          placeholder="Width"
          placeholderTextColor={colors.textMuted}
          value={width}
          onChangeText={setWidth}
        />
        <Text style={styles.hint}>{widthMm !== null ? `= ${widthMm} mm` : ' '}</Text>

        <TextInput
          style={styles.input}
          placeholder="Quantity"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          value={quantity}
          onChangeText={setQuantity}
        />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Material</Text>
        <View style={styles.chipWrap}>
          {materials.map(m => (
            <TouchableOpacity
              key={m.id}
              onPress={() => {
                setMaterialId(m.id);
                setThicknessId('');
              }}
              style={[styles.chip, materialId === m.id && styles.chipActive]}>
              <Text style={[styles.chipText, materialId === m.id && styles.chipTextActive]}>
                {m.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {material ? (
          <>
            <Text style={[styles.cardTitle, {marginTop: spacing.md}]}>Thickness</Text>
            <View style={styles.chipWrap}>
              {material.thicknesses.map(t => (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => setThicknessId(t.id)}
                  style={[styles.chip, thicknessId === t.id && styles.chipActive]}>
                  <Text
                    style={[styles.chipText, thicknessId === t.id && styles.chipTextActive]}>
                    {t.label ?? `${Number(t.valueMm)} mm`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}
      </Card>

      <Button title="Punch order" variant="success" loading={busy} onPress={submit} />
      <Text style={styles.footnote}>
        Photos can be attached from the web app. Adding them here needs a camera
        module — see the README.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.bg},
  content: {padding: spacing.md, paddingBottom: spacing.xl},
  cardTitle: {
    color: colors.textMuted,
    fontSize: font.tiny,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: font.body,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  hint: {color: colors.textMuted, fontSize: font.tiny, marginTop: -6, marginBottom: spacing.sm},
  selected: {flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm},
  selectedName: {color: colors.text, fontSize: font.body, fontWeight: '700'},
  smallButton: {minHeight: 40, paddingHorizontal: spacing.md},
  result: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resultName: {color: colors.text, fontSize: font.body, fontWeight: '600'},
  meta: {color: colors.textMuted, fontSize: font.small},
  unitRow: {flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.sm},
  unitChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unitChipActive: {backgroundColor: colors.primary, borderColor: colors.primary},
  unitText: {color: colors.textMuted, fontSize: font.tiny, fontWeight: '700'},
  unitTextActive: {color: '#fff'},
  chipWrap: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  chipActive: {backgroundColor: colors.primary, borderColor: colors.primary},
  chipText: {color: colors.text, fontSize: font.small, fontWeight: '600'},
  chipTextActive: {color: '#fff'},
  footnote: {
    color: colors.textMuted,
    fontSize: font.tiny,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
