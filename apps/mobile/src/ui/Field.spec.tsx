import Clipboard from '@react-native-clipboard/clipboard';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Chip, ChipGroup, Field, SelectField } from './Field';
import { looksLikePhone } from '../hooks/useClipboardSuggestion';

const clipboard = Clipboard as unknown as { getString: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
  clipboard.getString.mockResolvedValue('');
});

async function mountField(props: Record<string, unknown> = {}) {
  const onChangeText = jest.fn();
  const view = await render(
    <Field
      label="Phone"
      value=""
      onChangeText={onChangeText}
      placeholder="Type a number"
      {...props}
    />,
  );
  return { onChangeText, view, input: screen.getByPlaceholderText('Type a number') };
}

describe('Field', () => {
  it('shows its label and hint', async () => {
    await mountField({ hint: 'With the country code' });
    expect(screen.getByText('Phone')).toBeTruthy();
    expect(screen.getByText('With the country code')).toBeTruthy();
  });

  it('shows an error instead of the hint', async () => {
    await mountField({ hint: 'Optional', error: 'Required' });
    expect(screen.getByText('Required')).toBeTruthy();
    expect(screen.queryByText('Optional')).toBeNull();
  });

  it('offers a paste when the clipboard fits the field', async () => {
    clipboard.getString.mockResolvedValue('9820012345');
    const { input } = await mountField({ pasteAccepts: looksLikePhone });
    await fireEvent(input, 'focus');
    expect(await screen.findByText('Paste')).toBeTruthy();
    expect(screen.getByText(/On your clipboard: 9820012345/)).toBeTruthy();
  });

  it('puts the clipboard text in when the offer is taken', async () => {
    clipboard.getString.mockResolvedValue('9820012345');
    const { input, onChangeText } = await mountField({ pasteAccepts: looksLikePhone });
    await fireEvent(input, 'focus');
    await fireEvent.press(await screen.findByText('Paste'));
    expect(onChangeText).toHaveBeenCalledWith('9820012345');
  });

  it('does not offer a paste that does not fit the field', async () => {
    clipboard.getString.mockResolvedValue('Shop 4, Link Road');
    const { input } = await mountField({ pasteAccepts: looksLikePhone });
    await fireEvent(input, 'focus');
    expect(screen.queryByText('Paste')).toBeNull();
  });

  it('never offers a paste into a password field', async () => {
    clipboard.getString.mockResolvedValue('9820012345');
    const { input } = await mountField({ secureTextEntry: true });
    await fireEvent(input, 'focus');
    // Nor does it read the clipboard at all for one.
    expect(screen.queryByText('Paste')).toBeNull();
    expect(clipboard.getString).not.toHaveBeenCalled();
  });

  it('does not offer over something the user already typed', async () => {
    clipboard.getString.mockResolvedValue('9820012345');
    const { input } = await mountField({ value: '98111' });
    await fireEvent(input, 'focus');
    // The button would be an invitation to destroy what is there.
    expect(screen.queryByText('Paste')).toBeNull();
  });

  it('can be told not to offer at all', async () => {
    clipboard.getString.mockResolvedValue('9820012345');
    const { input } = await mountField({ pasteable: false });
    await fireEvent(input, 'focus');
    expect(screen.queryByText('Paste')).toBeNull();
    expect(clipboard.getString).not.toHaveBeenCalled();
  });

  it('still calls the caller’s own focus and blur handlers', async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    const { input } = await mountField({ onFocus, onBlur });
    await fireEvent(input, 'focus');
    await fireEvent(input, 'blur');
    expect(onFocus).toHaveBeenCalled();
    expect(onBlur).toHaveBeenCalled();
  });

  it('reports what was typed', async () => {
    const { input, onChangeText } = await mountField();
    await fireEvent.changeText(input, '98200');
    expect(onChangeText).toHaveBeenCalledWith('98200');
  });
});

describe('ChipGroup', () => {
  const OPTIONS = [
    { id: 'm1', label: 'MDF', color: '#B98B54' },
    { id: 'm2', label: 'Plywood' },
  ];

  async function mount(props: Record<string, unknown> = {}) {
    const onChange = jest.fn();
    await render(
      <ChipGroup label="Material" options={OPTIONS} onChange={onChange} {...props} />,
    );
    return { onChange };
  }

  it('shows a chip per option', async () => {
    await mount();
    expect(screen.getByText('MDF')).toBeTruthy();
    expect(screen.getByText('Plywood')).toBeTruthy();
  });

  it('reports the chip that was pressed', async () => {
    const { onChange } = await mount();
    await fireEvent.press(screen.getByText('MDF'));
    expect(onChange).toHaveBeenCalledWith('m1');
  });

  it('pressing the chosen chip again clears it', async () => {
    const { onChange } = await mount({ value: 'm1' });
    await fireEvent.press(screen.getByText('MDF'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('offers an explicit "Any" only where clearing makes sense', async () => {
    await mount();
    expect(screen.queryByText('Any')).toBeNull();
    await mount({ allowClear: true });
    expect(screen.getByText('Any')).toBeTruthy();
  });

  it('clears from the Any chip', async () => {
    const { onChange } = await mount({ allowClear: true, value: 'm1' });
    await fireEvent.press(screen.getByText('Any'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('paints a chosen chip in the option’s own colour', async () => {
    const view = await render(
      <ChipGroup options={OPTIONS} value="m1" onChange={() => {}} />,
    );
    expect(JSON.stringify(view.toJSON())).toContain('#B98B54');
  });
});

describe('Chip', () => {
  it('reports a press', async () => {
    const onPress = jest.fn();
    await render(<Chip label="Cutting" onPress={onPress} />);
    await fireEvent.press(screen.getByText('Cutting'));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('SelectField', () => {
  it('shows the placeholder until it has a value', async () => {
    await render(<SelectField label="Material" onPress={() => {}} />);
    expect(screen.getByText('Select…')).toBeTruthy();
  });

  it('shows the value once there is one', async () => {
    await render(<SelectField value="MDF" onPress={() => {}} />);
    expect(screen.getByText('MDF')).toBeTruthy();
  });

  it('opens the picker when pressed', async () => {
    const onPress = jest.fn();
    await render(<SelectField value="MDF" onPress={onPress} />);
    await fireEvent.press(screen.getByText('MDF'));
    expect(onPress).toHaveBeenCalled();
  });
});

it('announces its label, so the input is not an unlabelled box', async () => {
  await render(<Field label="Account number" value="" onChangeText={jest.fn()} />);
  expect(screen.getByLabelText('Account number')).toBeTruthy();
});

it('lets a caller override what is announced', async () => {
  await render(
    <Field label="Qty" accessibilityLabel="Quantity in sqf" value="" onChangeText={jest.fn()} />,
  );
  expect(screen.getByLabelText('Quantity in sqf')).toBeTruthy();
});
