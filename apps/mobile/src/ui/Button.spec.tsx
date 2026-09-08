import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button, haptic } from './Button';

const feedback = ReactNativeHapticFeedback as unknown as { trigger: jest.Mock };

beforeEach(() => jest.clearAllMocks());

it('shows its title', async () => {
  await render(<Button title="Punch order" onPress={() => {}} />);
  expect(screen.getByText('Punch order')).toBeTruthy();
});

it('reports a press', async () => {
  const onPress = jest.fn();
  await render(<Button title="Punch order" onPress={onPress} />);
  await fireEvent.press(screen.getByText('Punch order'));
  expect(onPress).toHaveBeenCalled();
});

it('gives a press a light tap of feedback', async () => {
  await render(<Button title="Punch order" onPress={() => {}} />);
  await fireEvent.press(screen.getByText('Punch order'));
  expect(feedback.trigger).toHaveBeenCalledWith('impactLight', expect.anything());
});

it('does nothing while disabled', async () => {
  const onPress = jest.fn();
  await render(<Button title="Punch order" onPress={onPress} disabled />);
  await fireEvent.press(screen.getByText('Punch order'));
  expect(onPress).not.toHaveBeenCalled();
});

it('does nothing while loading, and shows a spinner instead of the title', async () => {
  const onPress = jest.fn();
  const view = await render(<Button title="Punch order" onPress={onPress} loading />);
  // A second tap on a button already working would punch the order twice.
  expect(screen.queryByText('Punch order')).toBeNull();
  expect(JSON.stringify(view.toJSON())).toContain('ActivityIndicator');
});

it('draws a disabled primary as a plain pad, not a dimmed accent', async () => {
  const enabled = await render(<Button title="Go" onPress={() => {}} />);
  const disabled = await render(<Button title="Go" onPress={() => {}} disabled />);
  const accent = require('../theme').palette.accent as string;
  // Fading orange to 45% turns it muddy brown, which reads as broken rather
  // than unavailable — so the accent leaves the button entirely.
  expect(JSON.stringify(enabled.toJSON())).toContain(accent);
  expect(JSON.stringify(disabled.toJSON())).not.toContain(accent);
});

it('grows with its size', async () => {
  const small = await render(<Button title="Go" onPress={() => {}} size="sm" />);
  const large = await render(<Button title="Go" onPress={() => {}} size="lg" />);
  expect(JSON.stringify(small.toJSON())).toContain('"height":40');
  expect(JSON.stringify(large.toJSON())).toContain('"height":60');
});

it('renders an icon beside the title', async () => {
  await render(
    <Button title="Add a line" onPress={() => {}} icon={<></>} />,
  );
  expect(screen.getByText('Add a line')).toBeTruthy();
});

describe('haptic', () => {
  it('falls back to a vibration on a phone with no taptic engine', () => {
    haptic();
    expect(feedback.trigger).toHaveBeenCalledWith(
      'impactLight',
      expect.objectContaining({ enableVibrateFallback: true }),
    );
  });

  it('can be asked for a different kind of feedback', () => {
    haptic('notificationSuccess');
    expect(feedback.trigger).toHaveBeenCalledWith('notificationSuccess', expect.anything());
  });
});
