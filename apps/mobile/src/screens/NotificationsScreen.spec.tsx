import { fireEvent, render, screen } from '@testing-library/react-native';
import { NotificationsScreen } from './NotificationsScreen';

const goBack = jest.fn();

beforeEach(() => jest.clearAllMocks());

it('says there is nothing to catch up on yet', async () => {
  await render(<NotificationsScreen navigation={{ goBack }} />);
  expect(screen.getByText('No notifications yet')).toBeTruthy();
  expect(
    screen.getByText('Moves on your orders and enquiries will show up here.'),
  ).toBeTruthy();
});

it('goes back', async () => {
  await render(<NotificationsScreen navigation={{ goBack }} />);
  await fireEvent.press(screen.getByLabelText('Back'));
  expect(goBack).toHaveBeenCalled();
});
