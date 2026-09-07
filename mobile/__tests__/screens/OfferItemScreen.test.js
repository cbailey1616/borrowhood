import React from 'react';
import { ThemedAlert as Alert } from '../../src/components/ThemedAlert';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';
import Screen from '../../src/screens/OfferItemScreen';

const navigation = { navigate: jest.fn(), goBack: jest.fn() };
const route = { params: { request: { id: 'request-1', title: 'Need a drill' } } };
beforeEach(() => {
  jest.clearAllMocks();
  api.getRequest.mockResolvedValue({ ...route.params.request, status: 'open', isExpired: false });
  api.getMyListings.mockResolvedValue([
    { id: 'drill', title: 'My drill', status: 'active', isAvailable: true },
    { id: 'saw', title: 'Unavailable saw', status: 'active', isAvailable: false },
  ]);
  api.offerItem.mockResolvedValue({});
});
afterEach(() => jest.restoreAllMocks());

it('explains an expired request before showing inventory or allowing a new offer', async () => {
  api.getRequest.mockResolvedValueOnce({ status: 'open', isExpired: true });
  const screen = render(<Screen navigation={navigation} route={route} />);
  await screen.findByText(/This request has ended/);
  expect(api.getMyListings).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Add a new item privately'));
  expect(navigation.navigate).not.toHaveBeenCalled();
  expect(api.offerItem).not.toHaveBeenCalled();
});

it('refreshes inventory after a selected item becomes unavailable', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  api.offerItem.mockRejectedValueOnce(Object.assign(new Error('The item is no longer available.'), { status: 409 }));
  const screen = render(<Screen navigation={navigation} route={route} />);
  fireEvent.press(await screen.findByText('My drill'));
  api.getMyListings.mockResolvedValueOnce([]);
  await act(async () => alert.mock.calls[0][2].find(a => a.text === 'Send private offer').onPress());
  await waitFor(() => expect(screen.queryByText('My drill')).toBeNull());
  expect(navigation.goBack).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledWith('Could not send offer', 'The item is no longer available.');
});

it('requires explicit confirmation and offers only the selected item', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  const { findByText, queryByText } = render(<Screen navigation={navigation} route={route} />);
  fireEvent.press(await findByText('My drill'));
  expect(queryByText('Unavailable saw')).toBeNull();
  expect(api.offerItem).not.toHaveBeenCalled();
  const actions = alert.mock.calls[0][2];
  await act(async () => { await actions.find(a => a.text === 'Send private offer').onPress(); });
  expect(api.offerItem).toHaveBeenCalledWith('request-1', 'drill');
  expect(navigation.goBack).toHaveBeenCalled();
});

it('retains the request context when adding a new private item', async () => {
  const { findByText } = render(<Screen navigation={navigation} route={route} />);
  await findByText('My drill');
  fireEvent.press(await findByText('Add a new item privately'));
  expect(navigation.navigate).toHaveBeenCalledWith('CreateListing', { requestMatch: route.params.request });
});
