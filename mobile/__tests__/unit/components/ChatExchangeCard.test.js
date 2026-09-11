import React from 'react';
import { ThemedAlert as Alert } from '../../../src/components/ThemedAlert';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../../src/services/api';
import ChatExchangeCard from '../../../src/components/ChatExchangeCard';
const navigate = jest.fn();
const exchange = { id: 'exchange-1', borrower: { id: 'neighbor' }, lender: { id: 'owner' }, listing: { id: 'drill', title: 'Garden drill' }, status: 'pending', startDate: '2026-09-10', endDate: '2026-09-12' };
beforeEach(() => { jest.clearAllMocks(); api.getTransactions.mockResolvedValue([exchange]); });
afterEach(() => jest.restoreAllMocks());
const screen = props => render(<ChatExchangeCard userId="owner" otherId="neighbor" navigation={{ navigate }} focused {...props} />);

it('opens the owner queue without approving from chat', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  const view = screen();
  fireEvent.press(await view.findByText('View queue'));
  expect(navigate).toHaveBeenCalledWith('RequestQueue', { listingId: 'drill' });
  expect(view.queryByText('Approve request')).toBeNull();
  expect(alert).not.toHaveBeenCalled();
  expect(api.approveRental).not.toHaveBeenCalled();
});
it('keeps a pending borrower on their own exchange details', async () => {
  const view = screen({ userId: 'neighbor', otherId: 'owner' });
  fireEvent.press(await view.findByText('Borrow details'));
  expect(navigate).toHaveBeenCalledWith('TransactionDetail', { id: 'exchange-1' });
  expect(view.queryByText('View queue')).toBeNull();
  expect(api.approveRental).not.toHaveBeenCalled();
});
it('still requires confirmation before a borrower confirms pickup', async () => {
  api.getTransactions.mockResolvedValue([{ ...exchange, status: 'approved' }]);
  const alert = jest.spyOn(Alert, 'alert');
  const view = screen({ userId: 'neighbor', otherId: 'owner' });
  fireEvent.press(await view.findByText('Confirm pickup'));
  expect(api.confirmRentalPickup).not.toHaveBeenCalled();
  await act(async () => { await alert.mock.calls[0][2].find(button => button.text === 'Confirm pickup').onPress(); });
  expect(api.confirmRentalPickup).toHaveBeenCalledWith('exchange-1');
  expect(navigate).not.toHaveBeenCalled();
  expect(api.approveRental).not.toHaveBeenCalled();
});
it('opens full details for returns so condition review stays intact', async () => {
  api.getTransactions.mockResolvedValue([{ ...exchange, status: 'return_pending' }]);
  const view = screen();
  fireEvent.press(await view.findByText('Confirm return'));
  expect(navigate).toHaveBeenCalledWith('TransactionDetail', { id: 'exchange-1' });
  expect(api.confirmRentalReturn).not.toHaveBeenCalled();
});
it('does not add inline payment actions to legacy paid exchanges', async () => {
  api.getTransactions.mockResolvedValue([{ ...exchange, status: 'approved', rentalFee: 5 }]);
  const view = screen();
  await view.findByText('Borrow details');
  expect(view.queryByText('Approve request')).toBeNull();
});
it('sends a legacy pending owner request to its queue', async () => {
  api.getTransactions.mockResolvedValue([{ ...exchange, rentalFee: 5 }]);
  const view = screen();
  fireEvent.press(await view.findByText('View queue'));
  expect(navigate).toHaveBeenCalledWith('RequestQueue', { listingId: 'drill' });
  expect(api.approveRental).not.toHaveBeenCalled();
});
it('shows a retry for failed exchange loading, without hiding chat', async () => {
  api.getTransactions.mockRejectedValueOnce(new Error('offline'));
  const view = screen();
  fireEvent.press(await view.findByText(/Tap to retry/));
  await waitFor(() => expect(api.getTransactions).toHaveBeenCalledTimes(2));
  await view.findByText('Garden drill');
});
