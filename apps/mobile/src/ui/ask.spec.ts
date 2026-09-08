import { Alert } from 'react-native';
import { ask } from './ask';

const BUTTONS = [
  { text: 'Cancel', style: 'cancel' as const },
  { text: 'Move', onPress: jest.fn() },
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('where the platform can take typed input', () => {
  beforeEach(() => {
    (Alert as unknown as { prompt: jest.Mock }).prompt = jest.fn();
  });

  it('asks with a field to type the answer in', () => {
    ask('A note is required', 'Moving to Design requires a note', BUTTONS);
    const prompt = (Alert as unknown as { prompt: jest.Mock }).prompt;
    expect(prompt).toHaveBeenCalledWith(
      'A note is required',
      'Moving to Design requires a note',
      BUTTONS,
      'plain-text',
    );
  });

  it('does not also put a plain alert up behind it', () => {
    ask('A note is required', 'Moving to Design requires a note', BUTTONS);
    // `Alert.prompt?.(…) ?? Alert.alert(…)` reads like a fallback and is not
    // one: prompt returns undefined, so both dialogs came up stacked.
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

describe('where it cannot', () => {
  beforeEach(() => {
    delete (Alert as unknown as { prompt?: unknown }).prompt;
  });

  it('offers the same buttons without the field', () => {
    ask('Send ORD-1 back?', 'It would go back a stage.', BUTTONS);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Send ORD-1 back?',
      'It would go back a stage.',
      BUTTONS,
    );
  });

  it('calls the handler with nothing, which every caller must expect', () => {
    ask('Send ORD-1 back?', 'It would go back a stage.', BUTTONS);
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as typeof BUTTONS;
    buttons.find((button) => button.text === 'Move')!.onPress!();
    expect(BUTTONS[1].onPress).toHaveBeenCalledWith();
  });
});
