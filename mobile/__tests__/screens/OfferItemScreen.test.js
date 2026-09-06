import React from 'react';
import { ThemedAlert as Alert } from '../../src/components/ThemedAlert';
import { render, fireEvent, act } from '@testing-library/react-native';
import api from '../../src/services/api';
import Screen from '../../src/screens/OfferItemScreen';

const navigation = { navigate: jest.fn(), goBack: jest.fn() };
const route = { params: { request: { id: 'request-1', title: 'Need a drill' } } };
beforeEach(() => {
  jest.clearAllMocks();
  api.getMyListings.mockResolvedValue([
    { id: 'drill', title: 'My drill', status: 'active', isAvailable: true },
    { id: 'saw', title: 'Unavailable saw', status: 'active', isAvailable: false },
  ]);
  api.offerItem.mockResolvedValue({});
});
afterEach(() => jest.restoreAllMocks());

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
