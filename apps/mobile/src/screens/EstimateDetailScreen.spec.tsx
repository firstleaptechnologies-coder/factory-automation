import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS } from '@fas/shared';
import { EstimateDetailScreen } from './EstimateDetailScreen';

const mockEstimate = jest.fn();
const mockSetStatus = jest.fn();
const mockConvert = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    estimate: (...a: unknown[]) => mockEstimate(...a),
    setEstimateStatus: (...a: unknown[]) => mockSetStatus(...a),
    convertEstimate: (...a: unknown[]) => mockConvert(...a),
    history: (...a: unknown[]) => mockHistory(...a),
  },
}));

const mockHistory = jest.fn();
const mockShareDocument = jest.fn();
jest.mock('../lib/documents', () => ({
  shareDocument: (...a: unknown[]) => mockShareDocument(...a),
}));

jest.mock('../lib/contacts', () => ({
  requestContactsAccess: async () => true,
  loadContacts: async () => [
    { id: '1', name: 'Ramesh Verma', phone: '9820012345' },
  ],
}));

let mockPermissions: string[] = [];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
}));

const ESTIMATE = {
  id: 'e1',
  code: 'EST-1',
  status: 'DRAFT',
  issuedOn: '2026-09-02T10:00:00Z',
  clientId: 'c1',
  clientName: null,
  client: { name: 'Verma Interiors' },
  orderId: null,
  subtotal: '50000',
  discount: '0',
  igst: '0',
  sgst: '4500',
  cgst: '4500',
  grandTotal: '59000',
  savedAmount: '0',
  items: [
    {
      id: 'i1',
      name: 'CNC jali',
      quantity: '10',
      unit: 'Sqf',
      ratePerUnit: '500',
      hsnSac: '4412',
      amount: '5900',
      discountAmount: '0',
      discountPct: '0',
      taxAmount: '900',
      gstRatePct: '18',
    },
  ],
};

const navigate = jest.fn();
const replace = jest.fn();

async function mount(over: Record<string, unknown> = {}) {
  mockEstimate.mockResolvedValue({ ...ESTIMATE, ...over });
  await render(
    <EstimateDetailScreen
      route={{ params: { estimateId: 'e1' } }}
      navigation={{ navigate, replace, goBack: jest.fn() }}
    />,
  );
  await screen.findByText('EST-1');
}

beforeEach(() => {
  mockHistory.mockResolvedValue([]);
  jest.clearAllMocks();
  mockPermissions = [PERMISSIONS.ESTIMATE_MANAGE];
  mockShareDocument.mockResolvedValue(true);
  mockSetStatus.mockResolvedValue({});
  mockConvert.mockResolvedValue({ id: 'o1' });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('heads the screen with the number and the client', async () => {
  await mount();
  expect(screen.getByText('EST-1')).toBeTruthy();
  expect(screen.getAllByText('Verma Interiors').length).toBeGreaterThan(0);
});

it('shows each line with its quantity, rate, HSN and GST', async () => {
  await mount();
  expect(screen.getByText('CNC jali')).toBeTruthy();
  expect(screen.getByText(/10 Sqf × ₹500 · HSN 4412/)).toBeTruthy();
  expect(screen.getByText(/GST ₹900 \(18%\)/)).toBeTruthy();
});

it('splits the tax into CGST and SGST for a client in the same state', async () => {
  await mount();
  expect(screen.getByText('SGST')).toBeTruthy();
  expect(screen.getByText('CGST')).toBeTruthy();
  expect(screen.queryByText('IGST')).toBeNull();
});

it('shows IGST instead for a client in another state', async () => {
  await mount({ igst: '9000', sgst: '0', cgst: '0' });
  expect(screen.getByText('IGST')).toBeTruthy();
  expect(screen.queryByText('SGST')).toBeNull();
});

it('says what the client saved only when they saved something', async () => {
  await mount();
  expect(screen.queryByText('You saved')).toBeNull();
  await mount({ savedAmount: '5310' });
  expect(screen.getByText('You saved')).toBeTruthy();
});

describe('sharing', () => {
  it('renders the document the server built, named by the estimate', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Share another way'));
    await waitFor(() => expect(mockShareDocument).toHaveBeenCalled());
    expect(mockShareDocument.mock.calls[0][0]).toMatchObject({
      path: '/estimates/e1/document',
      fileName: 'EST-1',
      message: 'Estimate EST-1 — ₹59,000',
    });
  });

  it('marks a draft as sent once it actually goes out', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Share another way'));
    // Asking the user to flip the status afterwards is a step everyone forgets.
    await waitFor(() => expect(mockSetStatus).toHaveBeenCalledWith('e1', 'SENT'));
  });

  it('does not touch the status when the share was dismissed', async () => {
    mockShareDocument.mockResolvedValue(false);
    await mount();
    await fireEvent.press(screen.getByText('Share another way'));
    await waitFor(() => expect(mockShareDocument).toHaveBeenCalled());
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it('does not re-mark an estimate that is already sent', async () => {
    await mount({ status: 'SENT' });
    await fireEvent.press(screen.getByText('Share another way'));
    await waitFor(() => expect(mockShareDocument).toHaveBeenCalled());
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it('does not change the status on behalf of someone who may not', async () => {
    mockPermissions = [];
    await mount();
    await fireEvent.press(screen.getByText('Share another way'));
    await waitFor(() => expect(mockShareDocument).toHaveBeenCalled());
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it('sends straight to a number picked from the address book', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Send on WhatsApp'));
    await fireEvent.press(await screen.findByText('Ramesh Verma'));
    await waitFor(() => expect(mockShareDocument).toHaveBeenCalled());
    expect(mockShareDocument.mock.calls[0][0].phone).toBe('9820012345');
  });

  it('reports a failure to share', async () => {
    mockShareDocument.mockRejectedValue(new Error('Could not build the PDF'));
    await mount();
    await fireEvent.press(screen.getByText('Share another way'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Could not share');
  });
});

describe('turning it into an order', () => {
  it('is offered only once it is attached to a client', async () => {
    await mount({ clientId: null });
    expect(screen.queryByText('Turn into an order')).toBeNull();
  });

  it('is not offered twice', async () => {
    await mount({ status: 'CONVERTED', orderId: 'o1' });
    expect(screen.queryByText('Turn into an order')).toBeNull();
    expect(screen.getByText('Open the order')).toBeTruthy();
  });

  it('says the agreed figure carries across unchanged', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Turn into an order'));
    expect(
      await screen.findByText('₹59,000 carries across unchanged'),
    ).toBeTruthy();
    expect(screen.getByText(/The estimate stays as the record of what was quoted/)).toBeTruthy();
  });

  it('needs a site before it will convert', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Turn into an order'));
    await fireEvent.press(await screen.findByText('Create the order'));
    expect(mockConvert).not.toHaveBeenCalled();
  });

  it('creates the order and replaces this screen with it', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Turn into an order'));
    await fireEvent.changeText(
      await screen.findByPlaceholderText('Where the work happens'),
      ' Andheri West ',
    );
    await fireEvent.press(screen.getByText('Create the order'));
    await waitFor(() =>
      expect(mockConvert).toHaveBeenCalledWith('e1', { location: 'Andheri West' }),
    );
    // Replaced, not pushed: going back to a converted estimate is a dead end.
    expect(replace).toHaveBeenCalledWith('OrderDetail', { orderId: 'o1' });
  });

  it('shows the server’s refusal', async () => {
    mockConvert.mockRejectedValue(new Error('EST-1 has already been turned into an order'));
    await mount();
    await fireEvent.press(screen.getByText('Turn into an order'));
    await fireEvent.changeText(
      await screen.findByPlaceholderText('Where the work happens'),
      'Andheri',
    );
    await fireEvent.press(screen.getByText('Create the order'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Could not convert');
  });

  it('opens the order it became', async () => {
    await mount({ status: 'CONVERTED', orderId: 'o1' });
    await fireEvent.press(screen.getByText('Open the order'));
    expect(navigate).toHaveBeenCalledWith('OrderDetail', { orderId: 'o1' });
  });
});

it('hides editing and status from someone who may not manage estimates', async () => {
  mockPermissions = [];
  await mount();
  expect(screen.queryByText('Edit')).toBeNull();
  expect(screen.queryByText('Status')).toBeNull();
  expect(screen.queryByText('Turn into an order')).toBeNull();
});

it('opens the editor on the same estimate', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Edit'));
  expect(navigate).toHaveBeenCalledWith('EstimateEdit', { estimateId: 'e1' });
});

describe('the enquiry it was quoted for', () => {
  const LEAD = {
    id: 'ld1',
    code: 'LEAD-1',
    title: 'Kitchen jali',
    status: { id: 's1', name: 'Quoted', color: '#D29922' },
  };

  it('says which enquiry it belongs to', async () => {
    await mount({ lead: LEAD, leadId: 'ld1' });
    expect(screen.getByText('Quoted for')).toBeTruthy();
    expect(screen.getByText('Kitchen jali')).toBeTruthy();
    expect(screen.getByText('LEAD-1 · Quoted')).toBeTruthy();
  });

  it('opens that enquiry', async () => {
    await mount({ lead: LEAD, leadId: 'ld1' });
    await fireEvent.press(screen.getByText('Kitchen jali'));
    expect(navigate).toHaveBeenCalledWith('LeadDetail', { leadId: 'ld1' });
  });

  it('says nothing on a quote written for somebody who rang up', async () => {
    await mount();
    expect(screen.queryByText('Quoted for')).toBeNull();
  });
});
