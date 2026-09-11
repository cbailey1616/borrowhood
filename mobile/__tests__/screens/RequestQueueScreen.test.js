import React from 'react';
import { render,fireEvent,waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';
import Screen from '../../src/screens/RequestQueueScreen';
const navigation={navigate:jest.fn()};
const item={id:'request-1',position:1,startDate:'2026-10-01',endDate:'2026-10-03',borrower:{id:'neighbor',firstName:'Alex',isVerified:true,totalTransactions:100,endorsement:{percent:96,count:25,score:93}}};
beforeEach(()=>{jest.clearAllMocks();api.getRequestQueue=jest.fn().mockResolvedValue({listing:{id:'item-1',title:'Drill',isAvailable:true,status:'active'},requests:[item]});api.approveRental.mockResolvedValue({});});
it('messages the selected person and chooses their request',async()=>{
 const screen=render(<Screen route={{params:{listingId:'item-1'}}} navigation={navigation}/>);
 await screen.findByLabelText('Neighbor Score 93 out of 100');
 expect(screen.queryByText('Verified identity')).toBeNull();
 expect(screen.getByLabelText("View Alex's profile, verified identity")).toBeTruthy();
 expect(screen.getByText('100 completed exchanges')).toBeTruthy();
 expect(screen.getByText('Ranger')).toBeTruthy();
 expect(screen.queryByText('Rank')).toBeNull();
 fireEvent.press(screen.getByLabelText("View Alex's profile, verified identity"));
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
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));

it.each([false, undefined])('omits the verification badge and label for %s', async isVerified => {
 api.getRequestQueue.mockResolvedValue({listing:{id:'item-1',title:'Drill',isAvailable:true,status:'active'},requests:[{...item,borrower:{...item.borrower,isVerified}}]});
 const screen=render(<Screen route={{params:{listingId:'item-1'}}} navigation={navigation}/>);
 await screen.findByText('Alex');
 expect(screen.queryByLabelText('Verified identity')).toBeNull();
 expect(screen.queryByText(/Not verified|Verification unavailable|Verified identity/)).toBeNull();
 expect(screen.getByLabelText("View Alex's profile")).toBeTruthy();
});
