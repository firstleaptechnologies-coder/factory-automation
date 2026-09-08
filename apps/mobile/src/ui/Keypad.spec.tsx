import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Keypad } from './Keypad';

const feedback = ReactNativeHapticFeedback as unknown as { trigger: jest.Mock };

async function mount(withClear = true) {
  const onKey = jest.fn();
  const onBackspace = jest.fn();
  const onClear = jest.fn();
  await render(
    <Keypad onKey={onKey} onBackspace={onBackspace} onClear={withClear ? onClear : undefined} />,
  );
  return { onKey, onBackspace, onClear };
}

beforeEach(() => jest.clearAllMocks());

it('offers every digit, a decimal point and a backspace', async () => {
  await mount();
  // Sizes are the only thing typed here and they are short numbers.
  for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '.']) {
    expect(screen.getByText(key)).toBeTruthy();
  }
});

it('reports the digit that was pressed', async () => {
  const { onKey } = await mount();
  await fireEvent.press(screen.getByText('7'));
  expect(onKey).toHaveBeenCalledWith('7');
});

it('reports a decimal point like any other key', async () => {
  const { onKey } = await mount();
  await fireEvent.press(screen.getByText('.'));
  expect(onKey).toHaveBeenCalledWith('.');
});

it('deletes rather than typing the word "back"', async () => {
  const { onKey, onBackspace } = await mount();
  await fireEvent.press(screen.getByTestId('keypad-back'));
  expect(onBackspace).toHaveBeenCalled();
  expect(onKey).not.toHaveBeenCalled();
});

it('clears the whole figure on a long press', async () => {
  const { onClear } = await mount();
  await fireEvent(screen.getByTestId('keypad-back'), 'longPress');
  expect(onClear).toHaveBeenCalled();
});

it('has no long press to offer when the screen does not want one', async () => {
  await mount(false);
  expect(screen.getByTestId('keypad-back').props.onLongPress).toBeUndefined();
});

it('does not offer a long press on a digit', async () => {
  await mount();
  expect(screen.getByTestId('keypad-7').props.onLongPress).toBeUndefined();
});

it('taps out feedback on every key', async () => {
  await mount();
  await fireEvent.press(screen.getByText('5'));
  expect(feedback.trigger).toHaveBeenCalledWith('impactLight', expect.anything());
});
