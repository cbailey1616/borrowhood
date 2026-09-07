import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockUser = { id:'staff', isAdmin:true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
const report = { id:'report-1',version:3,reportedId:'target',reportedName:'Alex',reporterName:'Sam',reason:'Harassment',status:'open',accountStatus:'pending',reportCount:2,activeExchanges:1,history:[],createdAt:'2026-09-07T12:00:00Z' };
const navigation = { navigate:jest.fn() };
beforeEach(() => {
  jest.clearAllMocks(); mockUser.isAdmin=true;
  api.getSafetyReports = jest.fn().mockResolvedValue({reports:[report],page:1,hasMore:false});
  api.reviewSafetyReport = jest.fn().mockResolvedValue({ok:true});
});
const open = async () => {
  const Screen=require('../../src/screens/SafetyReportsScreen').default;
  const screen=render(<Screen navigation={navigation} />);
  fireEvent.press(await screen.findByLabelText('Review report about Alex'));
  return screen;
};
it('does not fetch sensitive reports for a nonadministrator', () => {
  mockUser.isAdmin=false;
  const Screen=require('../../src/screens/SafetyReportsScreen').default;
  const screen=render(<Screen navigation={navigation} />);
  expect(screen.getByText('Administrator access is required.')).toBeTruthy();
  expect(api.getSafetyReports).not.toHaveBeenCalled();
});
it('requires a note and explicit confirmation before suspending, and sends the report version', async () => {
  const screen=await open();
  fireEvent.press(screen.getByText('Suspend account'));
  expect(api.reviewSafetyReport).not.toHaveBeenCalled();
  expect(screen.getByText('Add a review note before making a decision.')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Review note'),'Confirmed repeated harassment.');
  fireEvent.press(screen.getByText('Suspend account'));
  expect(screen.getByText('Suspend account?')).toBeTruthy();
  expect(api.reviewSafetyReport).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Close confirmation'));
  expect(api.reviewSafetyReport).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Suspend account'));
  fireEvent.press(screen.getAllByText('Suspend account').at(-1));
  await waitFor(() => expect(api.reviewSafetyReport).toHaveBeenCalledWith('report-1',{action:'suspend',note:'Confirmed repeated harassment.',version:3}));
});
it('keeps the note and displays failed decisions without claiming success', async () => {
  api.reviewSafetyReport.mockRejectedValueOnce(new Error('This report changed. Refresh it.'));
  const screen=await open();
  fireEvent.changeText(screen.getByLabelText('Review note'),'Reviewed report.');
  fireEvent.press(screen.getByText('Dismiss report'));
  fireEvent.press(screen.getAllByText('Dismiss report').at(-1));
  await screen.findByText('This report changed. Refresh it.');
  expect(screen.getByLabelText('Review note').props.value).toBe('Reviewed report.');
});
it('links to the reported profile', async () => {
  const screen=await open();
  fireEvent.press(screen.getByText('View reported profile'));
  expect(navigation.navigate).toHaveBeenCalledWith('UserProfile',{id:'target'});
});
