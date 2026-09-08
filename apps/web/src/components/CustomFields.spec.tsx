import { render, screen, fireEvent } from '@testing-library/react';
import { CustomFields } from './CustomFields';

const field = (over: Record<string, unknown> = {}) =>
  ({
    id: over.key ? `id-${over.key}` : 'id-architect',
    key: 'architect',
    label: 'Architect',
    type: 'TEXT',
    options: [],
    required: false,
    ...over,
  }) as never;

function mount(definitions: unknown[], values: Record<string, unknown> = {}) {
  const onChange = jest.fn();
  const view = render(
    <CustomFields definitions={definitions as never} values={values} onChange={onChange} />,
  );
  return { onChange, view };
}

it('renders whatever the admin defined, and nothing else', () => {
  // Nothing here knows what a lead contains.
  mount([field(), field({ key: 'budget', label: 'Budget' })]);
  expect(screen.getByText('Architect')).toBeInTheDocument();
  expect(screen.getByText('Budget')).toBeInTheDocument();
});

it('marks a required field', () => {
  mount([field({ required: true })]);
  expect(screen.getByText('Architect *')).toBeInTheDocument();
});

it('shows the admin’s help text', () => {
  mount([field({ helpText: 'Who specified the job' })]);
  expect(screen.getByText('Who specified the job')).toBeInTheDocument();
});

it('merges an edit into the values rather than replacing them', () => {
  const { onChange } = mount([field()], { budget: 500 });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Rao' } });
  expect(onChange).toHaveBeenCalledWith({ budget: 500, architect: 'Rao' });
});

it('clears a field to undefined rather than an empty string', () => {
  const { onChange } = mount([field()], { architect: 'Rao' });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
  expect(onChange).toHaveBeenCalledWith({ architect: undefined });
});

describe('input types', () => {
  const typeOf = (definition: unknown) => {
    const { view } = mount([definition as never]);
    return view.container.querySelector('input')!.getAttribute('type');
  };

  it('gives a number field a numeric keypad', () => {
    expect(typeOf(field({ type: 'NUMBER' }))).toBe('number');
  });

  it('gives a date field a date picker', () => {
    expect(typeOf(field({ type: 'DATE' }))).toBe('date');
  });

  it('gives an email field an email keyboard', () => {
    expect(typeOf(field({ type: 'EMAIL' }))).toBe('email');
  });

  it('falls back to plain text for anything else', () => {
    expect(typeOf(field({ type: 'TEXT' }))).toBe('text');
  });
});

describe('boolean', () => {
  const boolean = field({ type: 'BOOLEAN' });

  it('starts blank rather than guessing No', () => {
    const { view } = mount([boolean]);
    // An unanswered yes/no is not the same as "no".
    expect(view.container.querySelector('.select-trigger')!.textContent).toContain('—');
  });

  it('records a real boolean, not the string', () => {
    const { onChange, view } = mount([boolean]);
    fireEvent.click(view.container.querySelector('.select-trigger')!);
    fireEvent.click(screen.getByRole('option', { name: 'Yes' }));
    expect(onChange).toHaveBeenCalledWith({ architect: true });
  });

  it('records false as false, not as cleared', () => {
    const { onChange, view } = mount([boolean]);
    fireEvent.click(view.container.querySelector('.select-trigger')!);
    fireEvent.click(screen.getByRole('option', { name: 'No' }));
    expect(onChange).toHaveBeenCalledWith({ architect: false });
  });

  it('clears back to nothing', () => {
    const { onChange, view } = mount([boolean], { architect: true });
    fireEvent.click(view.container.querySelector('.select-trigger')!);
    fireEvent.click(screen.getByRole('option', { name: '—' }));
    expect(onChange).toHaveBeenCalledWith({ architect: undefined });
  });

  it('shows an existing false as No', () => {
    const { view } = mount([boolean], { architect: false });
    expect(view.container.querySelector('.select-trigger')!.textContent).toContain('No');
  });
});

describe('select', () => {
  const select = field({ type: 'SELECT', options: ['Under 1L', '1-5L'] });

  it('offers the admin’s options plus a way to clear', () => {
    const { view } = mount([select]);
    fireEvent.click(view.container.querySelector('.select-trigger')!);
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('records the chosen option', () => {
    const { onChange, view } = mount([select]);
    fireEvent.click(view.container.querySelector('.select-trigger')!);
    fireEvent.click(screen.getByRole('option', { name: '1-5L' }));
    expect(onChange).toHaveBeenCalledWith({ architect: '1-5L' });
  });

  it('clears to undefined rather than an empty string', () => {
    const { onChange, view } = mount([select], { architect: '1-5L' });
    fireEvent.click(view.container.querySelector('.select-trigger')!);
    fireEvent.click(screen.getByRole('option', { name: '—' }));
    expect(onChange).toHaveBeenCalledWith({ architect: undefined });
  });
});

describe('multi-select', () => {
  const multi = field({ type: 'MULTI_SELECT', options: ['Wood', 'Stone', 'Metal'] });

  it('adds a value to the list', () => {
    const { onChange } = mount([multi], { architect: ['Wood'] });
    fireEvent.click(screen.getByText('Stone'));
    expect(onChange).toHaveBeenCalledWith({ architect: ['Wood', 'Stone'] });
  });

  it('takes one back out', () => {
    const { onChange } = mount([multi], { architect: ['Wood', 'Stone'] });
    fireEvent.click(screen.getByText('Wood'));
    expect(onChange).toHaveBeenCalledWith({ architect: ['Stone'] });
  });

  it('starts from an empty list when the value is not an array', () => {
    const { onChange } = mount([multi], { architect: 'Wood' });
    fireEvent.click(screen.getByText('Stone'));
    expect(onChange).toHaveBeenCalledWith({ architect: ['Stone'] });
  });

  it('marks the chosen ones', () => {
    mount([multi], { architect: ['Stone'] });
    expect(screen.getByText('Stone')).toHaveClass('primary');
    expect(screen.getByText('Wood')).not.toHaveClass('primary');
  });
});

it('gives long text the full width of the form', () => {
  const { view } = mount([field({ type: 'LONG_TEXT' })]);
  expect((view.container.querySelector('.field') as HTMLElement).style.gridColumn).toBe(
    '1 / -1',
  );
});
