import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';
const navigation = { navigate: jest.fn(), popToTop: jest.fn() };
const mockShowError = jest.fn();
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: jest.fn() }) }));
const route = { params: { requestTitle: 'Ladder', requestData: { title: 'Need a ladder', visibility: ['town'] }, suggestions: [{ id: 'l-1', title: 'Ladder', isAvailable: true, listingType: 'lend', user: { firstName: 'Sam' } }] } };
beforeEach(() => jest.clearAllMocks());
it('opens a matching item without posting the draft request', () => {
  const Screen = require('../../src/screens/RequestSuggestionsScreen').default;
  const screen = render(<Screen route={route} navigation={navigation} />);
  fireEvent.press(screen.getByText('Ladder'));
  expect(navigation.navigate).toHaveBeenCalledWith('ListingDetail', { id: 'l-1' });
  expect(api.createRequest).not.toHaveBeenCalled();
});
it('posts the prepared request once even when tapped twice', async () => {
  let finish;
  api.createRequest.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const Screen = require('../../src/screens/RequestSuggestionsScreen').default;
  const screen = render(<Screen route={route} navigation={navigation} />);
  const button = screen.getByText('None of these — post my request');
  fireEvent.press(button); fireEvent.press(button);
  expect(api.createRequest).toHaveBeenCalledTimes(1);
  expect(api.createRequest).toHaveBeenCalledWith(route.params.requestData);
  await act(async () => finish({ id: 'r-1' }));
  expect(navigation.popToTop).toHaveBeenCalledTimes(1);
});
it('keeps the request available for retry after a failed post', async () => {
  api.createRequest.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ id: 'r-1' });
  const Screen = require('../../src/screens/RequestSuggestionsScreen').default;
  const screen = render(<Screen route={route} navigation={navigation} />);
  fireEvent.press(screen.getByText('None of these — post my request'));
  await waitFor(() => expect(mockShowError).toHaveBeenCalled());
  fireEvent.press(screen.getByText('None of these — post my request'));
  await waitFor(() => expect(navigation.popToTop).toHaveBeenCalledTimes(1));
});
