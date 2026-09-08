/**
 * Native modules the app talks to, stubbed.
 *
 * These wrap platform APIs that do not exist under Jest. Stubbing them here
 * rather than in each test keeps the tests about our own logic — the clipboard
 * matchers, phone normalisation, paging — instead of about React Native.
 */

jest.mock('@react-native-clipboard/clipboard', () => ({
  __esModule: true,
  default: { getString: jest.fn(async () => ''), setString: jest.fn() },
}));

jest.mock('react-native-contacts', () => ({
  __esModule: true,
  default: { getAll: jest.fn(async () => []), requestPermission: jest.fn(async () => 'authorized') },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
    multiGet: jest.fn(async () => []),
    multiSet: jest.fn(async () => undefined),
    multiRemove: jest.fn(async () => undefined),
    clear: jest.fn(async () => undefined),
  },
}));

jest.mock('react-native-haptic-feedback', () => ({
  __esModule: true,
  default: { trigger: jest.fn() },
}));

jest.mock('react-native-html-to-pdf', () => ({
  generatePDF: jest.fn(async () => ({ filePath: '/tmp/test.pdf' })),
}));

jest.mock('react-native-share', () => ({
  __esModule: true,
  default: { open: jest.fn(async () => ({})), shareSingle: jest.fn(async () => ({})), Social: {} },
}));

jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(async () => ({ assets: [] })),
  launchCamera: jest.fn(async () => ({ assets: [] })),
}));

jest.mock('react-native-linear-gradient', () => 'LinearGradient');

/**
 * Navigation focus, outside a navigator.
 *
 * `usePaginated` refetches when a screen regains focus. In a test there is no
 * navigator, so focus is treated as "mounted once" — which is what the first
 * render means anyway.
 */
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

/**
 * Safe-area insets, outside a provider.
 *
 * The real provider measures the device. Under Jest there is no device, and a
 * component that asks for insets throws rather than falling back — so a flat
 * zero inset stands in.
 */
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    ...actual,
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
    SafeAreaProvider: ({ children }) => children,
    SafeAreaView: actual.SafeAreaView,
  };
});

// Gesture Handler's own stubs, so a GestureDetector renders and its handlers
// can be driven from a test.
require('react-native-gesture-handler/jestSetup');
