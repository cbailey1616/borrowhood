import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import api from '../../src/services/api';
import ExchangeIssueScreen, { REPORT_NOTICE } from '../../src/screens/ExchangeIssueScreen';

const navigation = { goBack: jest.fn(), navigate: jest.fn(), addListener: jest.fn(() => jest.fn()) };
const route = { params: { transactionId: 'exchange-1' } };
const exchange = { id: 'exchange-1', status: 'return_pending', actualPickupAt: '2026-01-01T12:00:00Z',
  endDate: '2026-01-04', isLender: true, isBorrower: false, listingType: 'lend',
  listing: { title: 'Pressure washer', photos: [] }, borrower: { id: 'borrower' }, lender: { id: 'owner' } };
beforeEach(() => {
  jest.clearAllMocks(); api.getTransaction.mockResolvedValue(exchange);
  api.reportExchangeIssue = jest.fn().mockResolvedValue({ id: 'report' });
  api.uploadImages.mockResolvedValue(['https://uploaded-photo']);
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'photo-1' }, { uri: 'photo-2' }] });
});
const open = async () => { const screen = render(<ExchangeIssueScreen navigation={navigation} route={route} />); await screen.findByText('What happened?', {}, { timeout: 10000 }); return screen; };

it.each([['non_return','Item wasn’t returned'],['damage','Item was damaged']])('submits a %s account report with optional details',async(reason,label)=>{
  const screen=await open();
  expect(screen.getByText(REPORT_NOTICE)).toBeTruthy();
  expect(screen.getByLabelText('Submit report')).toBeDisabled();
  fireEvent.press(screen.getByLabelText(label));
  fireEvent.press(screen.getByLabelText('Submit report'));
  await screen.findByText('Report submitted');
  expect(api.reportExchangeIssue).toHaveBeenCalledWith('exchange-1',{reason,detail:'',photos:[]});
  expect(screen.getByText(REPORT_NOTICE)).toBeTruthy();
  expect(navigation.navigate).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Done'));
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
});
it('disables non-return until the agreed date passes while allowing damage reports',async()=>{
  api.getTransaction.mockResolvedValue({...exchange,endDate:'2099-01-01'});
  const screen=await open();
  expect(screen.getByLabelText('Item wasn’t returned').props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByLabelText('Item wasn’t returned'));
  expect(screen.getByLabelText('Submit report')).toBeDisabled();
  fireEvent.press(screen.getByLabelText('Item was damaged'));
  expect(screen.getByLabelText('Submit report')).not.toBeDisabled();
});
it('lets a borrower disclose damage without offering a missing-return accusation',async()=>{
  api.getTransaction.mockResolvedValue({...exchange,isBorrower:true,isLender:false});
  const screen=await open();
  expect(screen.queryByLabelText('Item wasn’t returned')).toBeNull();
  expect(screen.getByText('Report damage to the item you borrowed')).toBeTruthy();
});
it('uploads only the selected photos and keeps the report attached to its exchange',async()=>{
  const screen=await open();
  fireEvent.press(screen.getByLabelText('Item was damaged'));
  fireEvent.changeText(screen.getByLabelText('Issue details'),'  Hose was split when it came back.  ');
  fireEvent.press(screen.getByLabelText('Add photos'));
  await screen.findByLabelText('Remove photo 1');
  fireEvent.press(screen.getByLabelText('Remove photo 2'));
  fireEvent.press(screen.getByLabelText('Submit report'));
  await screen.findByText('Report submitted');
  expect(api.uploadImages).toHaveBeenCalledWith(['photo-1'],'listings');
  expect(api.reportExchangeIssue).toHaveBeenCalledWith('exchange-1',{reason:'damage',detail:'Hose was split when it came back.',photos:['https://uploaded-photo']});
});
it('preserves details after failure and prevents duplicate submissions',async()=>{
  let reject; api.reportExchangeIssue.mockImplementationOnce(()=>new Promise((resolve,r)=>{reject=r;}));
  const screen=await open();
  fireEvent.press(screen.getByLabelText('Item was damaged'));
  fireEvent.changeText(screen.getByLabelText('Issue details'),'Motor housing is cracked.');
  fireEvent.press(screen.getByLabelText('Submit report'));
  fireEvent.press(screen.getByLabelText('Submit report'));
  expect(api.reportExchangeIssue).toHaveBeenCalledTimes(1);
  await act(async()=>reject(new Error('Connection lost. Try again.')));
  expect(screen.getByText('Connection lost. Try again.')).toBeTruthy();
  expect(screen.getByLabelText('Issue details').props.value).toBe('Motor housing is cracked.');
  expect(screen.queryByText('Report submitted')).toBeNull();
  fireEvent.press(screen.getByLabelText('Submit report'));
  await screen.findByText('Report submitted');
});
it('does not send a partial report after a failed photo upload',async()=>{
  api.uploadImages.mockRejectedValueOnce(new Error('Photo upload failed.'));
  const screen=await open();fireEvent.press(screen.getByLabelText('Item was damaged'));
  fireEvent.press(screen.getByLabelText('Add photos'));await screen.findByLabelText('Remove photo 1');
  fireEvent.press(screen.getByLabelText('Submit report'));
  await screen.findByText('Photo upload failed.');
  expect(api.reportExchangeIssue).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Remove photo 1')).toBeTruthy();
});
it.each(['completed','pending'])('does not submit reports for a %s exchange',async status=>{
  api.getTransaction.mockResolvedValue({...exchange,status});const screen=render(<ExchangeIssueScreen navigation={navigation} route={route}/>);
  await screen.findByText(/no longer awaiting a return/);
  expect(screen.queryByLabelText('Submit report')).toBeNull();
});
it('does not submit after leaving while photos upload',async()=>{
  let resolveUpload;api.uploadImages.mockImplementationOnce(()=>new Promise(resolve=>{resolveUpload=resolve;}));
  const screen=await open();fireEvent.press(screen.getByLabelText('Item was damaged'));
  fireEvent.press(screen.getByLabelText('Add photos'));await screen.findByLabelText('Remove photo 1');
  fireEvent.press(screen.getByLabelText('Submit report'));
  await waitFor(()=>expect(api.uploadImages).toHaveBeenCalled());screen.unmount();
  await act(async()=>resolveUpload(['uploaded-photo']));
  expect(api.reportExchangeIssue).not.toHaveBeenCalled();
});
