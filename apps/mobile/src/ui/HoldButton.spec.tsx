import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { HoldButton } from './HoldButton';

const { __flushAnimations } = require('react-native-reanimated') as {
  __flushAnimations: (finished?: boolean) => void;
};
const feedback = ReactNativeHapticFeedback as unknown as { trigger: jest.Mock };

async function mount(props: Record<string, unknown> = {}) {
  const onComplete = jest.fn();
  await render(<HoldButton onComplete={onComplete} {...props} />);
  return { onComplete, pad: screen.getByText((props.title as string) ?? 'Hold to punch') };
}

/** Standing in for the fill animation reaching the end of its run. */
const finishHold = async () => act(async () => __flushAnimations(true));

beforeEach(() => jest.clearAllMocks());

it('says what holding it will do', async () => {
  await mount();
  expect(screen.getByText('Hold to punch')).toBeTruthy();
});

it('takes its own wording', async () => {
  await mount({ title: 'Hold to settle' });
  expect(screen.getByText('Hold to settle')).toBeTruthy();
});

it('does not commit on a tap', async () => {
  const { onComplete, pad } = await mount();
  await fireEvent(pad, 'pressIn');
  await fireEvent(pad, 'pressOut');
  await finishHold();
  // Punching writes a record the floor will act on; a pocket tap must not.
  expect(onComplete).not.toHaveBeenCalled();
});

it('commits once the hold runs to the end', async () => {
  const { onComplete, pad } = await mount();
  await fireEvent(pad, 'pressIn');
  await finishHold();
  expect(onComplete).toHaveBeenCalledTimes(1);
});

it('confirms with a success buzz rather than another tap', async () => {
  const { pad } = await mount();
  await fireEvent(pad, 'pressIn');
  await finishHold();
  expect(feedback.trigger).toHaveBeenCalledWith('notificationSuccess', expect.anything());
});

it('acknowledges the start of a hold', async () => {
  const { pad } = await mount();
  await fireEvent(pad, 'pressIn');
  expect(feedback.trigger).toHaveBeenCalledWith('impactMedium', expect.anything());
});

it('does nothing at all while disabled', async () => {
  const { onComplete, pad } = await mount({ disabled: true });
  await fireEvent(pad, 'pressIn');
  await finishHold();
  expect(onComplete).not.toHaveBeenCalled();
  expect(feedback.trigger).not.toHaveBeenCalled();
});

it('cannot be held twice into a double punch', async () => {
  const { onComplete, pad } = await mount();
  await fireEvent(pad, 'pressIn');
  await finishHold();
  await finishHold();
  expect(onComplete).toHaveBeenCalledTimes(1);
});
