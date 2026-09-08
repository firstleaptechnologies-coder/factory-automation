import { fireEvent, render, screen } from '@testing-library/react-native';
import { CustomFieldInputs } from './CustomFieldInputs';

const field = (over: Record<string, unknown> = {}) =>
  ({
    id: `id-${(over.key as string) ?? 'architect'}`,
    key: 'architect',
    label: 'Architect',
    type: 'TEXT',
    options: [],
    required: false,
    ...over,
  }) as never;

async function mount(definitions: unknown[], values: Record<string, unknown> = {}) {
  const onChange = jest.fn();
  const view = await render(
    <CustomFieldInputs definitions={definitions as never} values={values} onChange={onChange} />,
  );
  return { onChange, view };
}

it('renders whatever the admin defined, and nothing else', async () => {
  // Nothing here knows what a lead contains.
  await mount([field(), field({ key: 'budget', label: 'Budget' })]);
  expect(screen.getByText('Architect')).toBeTruthy();
  expect(screen.getByText('Budget')).toBeTruthy();
});

it('marks a required field', async () => {
  await mount([field({ required: true })]);
  expect(screen.getByText('Architect *')).toBeTruthy();
});

it('shows the admin’s help text', async () => {
  await mount([field({ helpText: 'Who specified the job' })]);
  expect(screen.getByText('Who specified the job')).toBeTruthy();
});

it('merges an edit into the values rather than replacing them', async () => {
  const { onChange } = await mount([field()], { budget: 500 });
  await fireEvent.changeText(screen.getByPlaceholderText('Optional'), 'Rao');
  expect(onChange).toHaveBeenCalledWith({ budget: 500, architect: 'Rao' });
});

it('clears a field to undefined rather than an empty string', async () => {
  const { onChange } = await mount([field()], { architect: 'Rao' });
  await fireEvent.changeText(screen.getByDisplayValue('Rao'), '');
  expect(onChange).toHaveBeenCalledWith({ architect: undefined });
});

it('gives a number field a numeric keypad', async () => {
  await mount([field({ type: 'NUMBER' })]);
  expect(screen.getByPlaceholderText('Optional').props.keyboardType).toBe('numeric');
});

it('gives a phone field a phone keypad', async () => {
  await mount([field({ type: 'PHONE' })]);
  expect(screen.getByPlaceholderText('Optional').props.keyboardType).toBe('phone-pad');
});

it('shows a date field the shape it wants', async () => {
  await mount([field({ type: 'DATE' })]);
  expect(screen.getByPlaceholderText('YYYY-MM-DD')).toBeTruthy();
});

it('renders an existing number as text without losing it', async () => {
  await mount([field({ type: 'NUMBER' })], { architect: 500 });
  expect(screen.getByDisplayValue('500')).toBeTruthy();
});

describe('boolean', () => {
  const boolean = field({ type: 'BOOLEAN' });

  it('offers yes and no, with neither chosen to begin with', async () => {
    const blank = await mount([boolean]);
    const answered = await mount([boolean], { architect: false });
    expect(screen.getAllByText('Yes').length).toBeGreaterThan(0);
    // An unanswered yes/no is not the same as "no", so the two must not look
    // the same.
    expect(JSON.stringify(blank.view.toJSON())).not.toBe(
      JSON.stringify(answered.view.toJSON()),
    );
  });

  it('records a real boolean, not the word', async () => {
    const { onChange } = await mount([boolean]);
    await fireEvent.press(screen.getByText('Yes'));
    expect(onChange).toHaveBeenCalledWith({ architect: true });
  });

  it('records false as false', async () => {
    const { onChange } = await mount([boolean]);
    await fireEvent.press(screen.getByText('No'));
    expect(onChange).toHaveBeenCalledWith({ architect: false });
  });
});

describe('select', () => {
  const select = field({ type: 'SELECT', options: ['Under 1L', '1-5L'] });

  it('offers the admin’s options as chips', async () => {
    await mount([select]);
    expect(screen.getByText('Under 1L')).toBeTruthy();
    expect(screen.getByText('1-5L')).toBeTruthy();
  });

  it('records the chosen option', async () => {
    const { onChange } = await mount([select]);
    await fireEvent.press(screen.getByText('1-5L'));
    expect(onChange).toHaveBeenCalledWith({ architect: '1-5L' });
  });

  it('pressing the chosen chip again clears it', async () => {
    const { onChange } = await mount([select], { architect: '1-5L' });
    await fireEvent.press(screen.getByText('1-5L'));
    expect(onChange).toHaveBeenCalledWith({ architect: undefined });
  });

  it('keeps one answer only', async () => {
    const { onChange } = await mount([select], { architect: 'Under 1L' });
    await fireEvent.press(screen.getByText('1-5L'));
    expect(onChange).toHaveBeenCalledWith({ architect: '1-5L' });
  });
});

describe('multi-select', () => {
  const multi = field({ type: 'MULTI_SELECT', options: ['Wood', 'Stone', 'Metal'] });

  it('adds a value to the list', async () => {
    const { onChange } = await mount([multi], { architect: ['Wood'] });
    await fireEvent.press(screen.getByText('Stone'));
    expect(onChange).toHaveBeenCalledWith({ architect: ['Wood', 'Stone'] });
  });

  it('takes one back out', async () => {
    const { onChange } = await mount([multi], { architect: ['Wood', 'Stone'] });
    await fireEvent.press(screen.getByText('Wood'));
    expect(onChange).toHaveBeenCalledWith({ architect: ['Stone'] });
  });

  it('starts from a single stored value rather than dropping it', async () => {
    const { onChange } = await mount([multi], { architect: 'Wood' });
    await fireEvent.press(screen.getByText('Stone'));
    expect(onChange).toHaveBeenCalledWith({ architect: ['Wood', 'Stone'] });
  });
});
