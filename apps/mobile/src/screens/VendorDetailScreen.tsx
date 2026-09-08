import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import type { Vendor } from '@decor/shared';
import { PERMISSIONS } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../auth/AuthContext';
import {
  Button,
  Card,
  Field,
  Loader,
  Screen,
  ScreenHeader,
  Text,
  haptic,
} from '../ui';
import { spacing } from '../theme';

/**
 * One vendor, read and written on the same screen.
 *
 * There is not enough to a vendor to justify a form of its own: a name, a
 * number, a GSTIN and what they supply. Splitting it would be two screens for
 * eight fields.
 */
export function VendorDetailScreen({ navigation, route }: { navigation: any; route: any }) {
  const id: string | undefined = route?.params?.id;
  const { can } = useAuth();
  const existing = useApi<Vendor | null>(
    () => (id ? api.vendor(id) : Promise.resolve(null)),
    [id],
  );

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [gstin, setGstin] = useState('');
  const [company, setCompany] = useState('');
  const [supplies, setSupplies] = useState('');
  const [address, setAddress] = useState('');
  const [terms, setTerms] = useState('');
  const [busy, setBusy] = useState(false);

  const canManage = can(PERMISSIONS.VENDOR_MANAGE);

  useEffect(() => {
    const row = existing.data;
    if (!row) return;
    setName(row.name);
    setPhone(row.phone ?? '');
    setGstin(row.gstin ?? '');
    setCompany(row.company ?? '');
    setSupplies(row.supplies ?? '');
    setAddress(row.address ?? '');
    setTerms(row.paymentTermDays == null ? '' : String(row.paymentTermDays));
  }, [existing.data]);

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        name: name.trim(),
        phone: phone.trim() || undefined,
        gstin: gstin.trim().toUpperCase(),
        company: company.trim() || undefined,
        supplies: supplies.trim() || undefined,
        address: address.trim() || undefined,
        paymentTermDays: terms ? Number(terms) : undefined,
      };
      const saved = id ? await api.updateVendor(id, body) : await api.createVendor(body);
      haptic('notificationSuccess');
      if (!id) navigation.replace('VendorDetail', { id: saved.id });
      else existing.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const retire = () =>
    Alert.alert(
      'Retire this vendor?',
      'The row stays — every purchase ever placed hangs off it. They just stop appearing when ordering.',
      [
        { text: 'Keep them', style: 'cancel' },
        {
          text: 'Retire',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.retireVendor(id!);
              haptic('notificationSuccess');
              existing.reload();
            } catch (e) {
              Alert.alert('Could not retire', e instanceof Error ? e.message : 'Unknown error');
            }
          },
        },
      ],
    );

  if (existing.loading) return <Loader label="Loading" />;
  const vendor = existing.data;

  return (
    <Screen>
      <ScreenHeader
        title={id ? (vendor?.name ?? 'Vendor') : 'New vendor'}
        subtitle={vendor ? `${vendor.code}${vendor.isActive ? '' : ' · retired'}` : undefined}
        onBack={() => navigation.goBack()}
      />

      <Card tone="dark" style={styles.block}>
        <Field label="Name" placeholder="Verma Boards" value={name} onChangeText={setName} />
        <Field
          label="Phone"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
        <Field
          label="What they supply"
          placeholder="Boards, hardware, adhesives"
          value={supplies}
          onChangeText={setSupplies}
        />
        <Field label="Trading name" value={company} onChangeText={setCompany} />
        <Field
          label="GSTIN"
          placeholder="08AAACH7409R1ZS"
          autoCapitalize="characters"
          value={gstin}
          onChangeText={setGstin}
        />
        <Field
          label="Usually paid in (days)"
          keyboardType="number-pad"
          value={terms}
          onChangeText={setTerms}
        />
        <Field label="Address" value={address} onChangeText={setAddress} multiline />
      </Card>

      {canManage ? (
        <View style={styles.actions}>
          <Button
            title={id ? 'Save' : 'Add them'}
            loading={busy}
            disabled={name.trim().length < 2}
            onPress={save}
            style={{ flex: 1 }}
          />
          {id && vendor?.isActive ? (
            <Button title="Retire" variant="danger" onPress={retire} style={{ flex: 1 }} />
          ) : null}
        </View>
      ) : (
        <Text variant="small" tone="faint" style={styles.readOnly}>
          You may look at vendors but not change them.
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  readOnly: { marginTop: spacing.lg, textAlign: 'center' },
});
