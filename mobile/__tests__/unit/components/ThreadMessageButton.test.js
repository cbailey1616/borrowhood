import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import Button from '../../../src/components/ThreadMessageButton';
import api from '../../../src/services/api';
const navigation = { navigate: jest.fn() };
beforeEach(() => jest.clearAllMocks());
it('does not offer private messaging yourself', () => {
  expect(render(<Button author={{ id: 'me' }} currentUserId="me" />).toJSON()).toBeNull();
});
it('resumes the existing private chat with thread context without sending', async () => {
  api.getConversations.mockResolvedValue([{ id: 'chat', otherUser: { id: 'other' } }]);
  const context = { id: 'item', title: 'Ladder', type: 'listing' };
  const screen = render(<Button author={{ id: 'other', firstName: 'Sam' }} currentUserId="me" navigation={navigation} context={context} />);
  fireEvent.press(screen.getByText('Private message'));
  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('Chat', expect.objectContaining({ conversationId: 'chat', recipientId: 'other', threadContext: context })));
  expect(api.sendMessage).not.toHaveBeenCalled();
});
it('shows retry and does not navigate after a lookup failure', async () => {
  api.getConversations.mockRejectedValue(new Error('offline'));
  const screen = render(<Button author={{ id: 'other' }} currentUserId="me" navigation={navigation} />);
  fireEvent.press(screen.getByText('Private message'));
  await screen.findByText('Try message again');
  expect(navigation.navigate).not.toHaveBeenCalled();
});
