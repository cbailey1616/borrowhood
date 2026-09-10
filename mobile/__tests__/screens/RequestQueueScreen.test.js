import React from 'react';
import { render,fireEvent,waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';
import Screen from '../../src/screens/RequestQueueScreen';
const navigation={navigate:jest.fn()};
const item={id:'request-1',position:1,startDate:'2026-10-01',endDate:'2026-10-03',borrower:{id:'neighbor',firstName:'Alex',isVerified:true,totalTransactions:100,endorsement:{percent:96,count:25}}};
beforeEach(()=>{jest.clearAllMocks();api.getRequestQueue=jest.fn().mockResolvedValue({listing:{id:'item-1',title:'Drill',isAvailable:true,status:'active'},requests:[item]});api.approveRental.mockResolvedValue({});});
it('messages the selected person and chooses their request',async()=>{
 const screen=render(<Screen route={{params:{listingId:'item-1'}}} navigation={navigation}/>);
 await screen.findByText('96%');
 expect(screen.getByText('Verified')).toBeTruthy();
 expect(screen.getByText('Robin')).toBeTruthy();
 fireEvent.press(screen.getByLabelText("View Alex's profile"));
 expect(navigation.navigate).toHaveBeenCalledWith('UserProfile',{id:'neighbor'});
 fireEvent.press(screen.getByLabelText('Message Alex'));
 expect(navigation.navigate).toHaveBeenCalledWith('Chat',expect.objectContaining({recipientId:'neighbor',listingId:'item-1'}));
 fireEvent.press(screen.getByLabelText('Choose Alex'));
 await waitFor(()=>expect(api.approveRental).toHaveBeenCalledWith('request-1'));
 await waitFor(()=>expect(navigation.navigate).toHaveBeenCalledWith('TransactionDetail',{id:'request-1'}));
});
it('keeps everyone visible but prevents choosing while reserved',async()=>{
 api.getRequestQueue.mockResolvedValue({listing:{id:'item-1',title:'Drill',availabilityStatus:'reserved'},activeTransactionId:'current',requests:[item]});
 const screen=render(<Screen route={{params:{listingId:'item-1'}}} navigation={navigation}/>);
 await screen.findByText('Alex');expect(screen.getByLabelText('Choose Alex')).toBeDisabled();
 fireEvent.press(screen.getByText('View current exchange'));
 expect(navigation.navigate).toHaveBeenCalledWith('TransactionDetail',{id:'current'});
 expect(api.approveRental).not.toHaveBeenCalled();
});

jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
