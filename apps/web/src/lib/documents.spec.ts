import { openDocument } from './documents';

const fetchText = jest.fn();
jest.mock('./api', () => ({ api: { fetchText: (...a: unknown[]) => fetchText(...a) } }));

function fakeTab() {
  return {
    document: { open: jest.fn(), write: jest.fn(), close: jest.fn() },
    close: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchText.mockResolvedValue('<html>a statement</html>');
});

it('fetches the document with the session rather than letting the tab do it', async () => {
  const tab = fakeTab();
  window.open = jest.fn(() => tab as never);

  await openDocument('/clients/c1/statement');

  // The whole bug: a tab asked to fetch this itself carries no token and gets
  // a 401 back.
  expect(fetchText).toHaveBeenCalledWith('/clients/c1/statement');
  expect(tab.document.write).toHaveBeenCalledWith('<html>a statement</html>');
});

it('opens the tab on the click, before the request', async () => {
  const order: string[] = [];
  window.open = jest.fn(() => {
    order.push('open');
    return fakeTab() as never;
  });
  fetchText.mockImplementation(async () => {
    order.push('fetch');
    return '<html/>';
  });

  await openDocument('/x');

  // A window opened after an await is a popup block, which looks to the user
  // exactly like the button doing nothing.
  expect(order).toEqual(['open', 'fetch']);
});

it('closes the empty tab when the document cannot be fetched', async () => {
  const tab = fakeTab();
  window.open = jest.fn(() => tab as never);
  fetchText.mockRejectedValue(new Error('Unauthorized'));

  await expect(openDocument('/x')).rejects.toThrow('Unauthorized');

  // Otherwise the failure is a blank tab sitting there saying nothing.
  expect(tab.close).toHaveBeenCalled();
});

it('hands the document over as a file when the tab is blocked', async () => {
  window.open = jest.fn(() => null);
  const click = jest.fn();
  jest.spyOn(document, 'createElement').mockReturnValue({ click } as never);
  URL.createObjectURL = jest.fn(() => 'blob:x');
  URL.revokeObjectURL = jest.fn();

  await openDocument('/clients/c1/statement');

  // The document is already fetched by then — losing it would be the worst of
  // both.
  expect(click).toHaveBeenCalled();
  jest.restoreAllMocks();
});
