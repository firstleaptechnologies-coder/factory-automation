import { PermissionsAndroid, Platform } from 'react-native';
import Contacts from 'react-native-contacts';
// The same reduction the server applies before it stores or compares a number,
// so a contact and a hand-typed number cannot become two clients.
import { normalisePhone } from '@fas/shared';

export interface PickedContact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
}

/**
 * Reading the phone's address book.
 *
 * Only ever called when someone taps "from contacts" — the list is read to
 * choose from, it stays on the device, and the one contact that is picked is
 * the only thing that reaches the server. Nothing is uploaded in bulk and
 * nothing is read in the background.
 */
export async function requestContactsAccess(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
      {
        title: 'Find a client in your contacts',
        message: 'Pick a name and number instead of typing them.',
        buttonPositive: 'Allow',
      },
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }

  const status = await Contacts.requestPermission();
  return status === 'authorized';
}

export async function loadContacts(): Promise<PickedContact[]> {
  const raw = await Contacts.getAll();

  return raw
    .map((contact) => {
      const name =
        [contact.givenName, contact.middleName, contact.familyName]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        contact.displayName ||
        contact.company ||
        '';

      return {
        id: contact.recordID,
        name,
        // The first number is the one people mean; the rest are rarely the
        // shop's contact for them.
        phone: normalisePhone(contact.phoneNumbers?.[0]?.number),
        email: contact.emailAddresses?.[0]?.email,
        company: contact.company || undefined,
      };
    })
    // A contact with no name is nothing to pick, and one with no number is no
    // use to a shop that rings people.
    .filter((contact) => contact.name && contact.phone)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export { normalisePhone };
