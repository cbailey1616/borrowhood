import React from 'react';
import { RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { render,fireEvent,waitFor,within,act } from '@testing-library/react-native';
import api from '../../src/services/api';
import Screen from '../../src/screens/RequestQueueScreen';
const navigation={navigate:jest.fn(),replace:jest.fn()};
const mockShowError=jest.fn();
const mockShowToast=jest.fn();
let mockQueueFocused=true;
const item={id:'request-1',position:1,startDate:'2026-10-01',endDate:'2026-10-03',borrower:{id:'neighbor',firstName:'Alex',isVerified:true,totalTransactions:100,endorsement:{percent:96,count:25,score:93}}};
beforeEach(()=>{
 jest.clearAllMocks();
 mockQueueFocused=true;
 useFocusEffect.mockImplementation(callback=>React.useEffect(()=>mockQueueFocused ? callback() : undefined,[callback,mockQueueFocused]));
 api.getRequestQueue=jest.fn().mockResolvedValue({listing:{id:'item-1',title:'Drill',isAvailable:true,status:'active'},requests:[item]});
 api.approveRental.mockResolvedValue({});
});
it('reviews and messages without approving, then approves from the queue',async()=>{
 const screen=render(<Screen route={{params:{listingId:'item-1'}}} navigation={navigation}/>);
 await screen.findByLabelText('Neighbor rating: Great, Ranger');
 expect(screen.queryByText('Verified identity')).toBeNull();
 expect(screen.getByLabelText("View Alex's profile, verified identity")).toBeTruthy();
 expect(screen.getByText('100 completed exchanges')).toBeTruthy();
 const identity=within(screen.getByTestId('MemberSummary.identity'));
 expect(identity.getByText('Alex')).toBeTruthy();
 expect(identity.getByLabelText('Neighbor rating: Great, Ranger')).toBeTruthy();
 expect(screen.queryByText('Ranger')).toBeNull();
 expect(screen.queryByText('Rank')).toBeNull();
 fireEvent.press(screen.getByLabelText('Neighbor rating: Great, Ranger'));
 expect(screen.getByText('Neighbor rating')).toBeTruthy();
 expect(navigation.navigate).not.toHaveBeenCalled();
 fireEvent.press(screen.getByLabelText('Close rank explanation'));
 fireEvent.press(screen.getByLabelText("View Alex's profile, verified identity"));
 expect(navigation.navigate).toHaveBeenCalledWith('UserProfile',{id:'neighbor'});
 fireEvent.press(screen.getByLabelText('Message Alex'));
 expect(navigation.navigate).toHaveBeenCalledWith('Chat',expect.objectContaining({recipientId:'neighbor',listingId:'item-1'}));
 fireEvent.press(screen.getByLabelText("View Alex's request"));
 expect(navigation.navigate).toHaveBeenCalledWith('TransactionDetail',{id:'request-1'});
 expect(api.approveRental).not.toHaveBeenCalled();
 fireEvent.press(screen.getByLabelText("Approve Alex's request"));
 await waitFor(()=>expect(api.approveRental).toHaveBeenCalledWith('request-1'));
 await waitFor(()=>expect(navigation.replace).toHaveBeenCalledWith('TransactionDetail',{id:'request-1'}));
});
it('keeps everyone visible but prevents choosing while reserved',async()=>{
 api.getRequestQueue.mockResolvedValue({listing:{id:'item-1',title:'Drill',availabilityStatus:'reserved'},activeTransactionId:'current',requests:[item]});
 const screen=render(<Screen route={{params:{listingId:'item-1'}}} navigation={navigation}/>);
 await screen.findByText('Alex');expect(screen.getByLabelText("Approve Alex's request")).toBeDisabled();
 fireEvent.press(screen.getByText('View current exchange'));
 expect(navigation.replace).toHaveBeenCalledWith('TransactionDetail',{id:'current'});
 expect(api.approveRental).not.toHaveBeenCalled();
});

jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: mockShowToast }) }));
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));

it.each([false, undefined])('omits the verification badge and label for %s', async isVerified => {
 api.getRequestQueue.mockResolvedValue({listing:{id:'item-1',title:'Drill',isAvailable:true,status:'active'},requests:[{...item,borrower:{...item.borrower,isVerified}}]});
 const screen=render(<Screen route={{params:{listingId:'item-1'}}} navigation={navigation}/>);
 await screen.findByText('Alex');
 expect(screen.queryByLabelText('Verified identity')).toBeNull();
 expect(screen.queryByText(/Not verified|Verification unavailable|Verified identity/)).toBeNull();
 expect(screen.getByLabelText("View Alex's profile")).toBeTruthy();
});

it('declines a waiting request only after confirmation, even when reserved', async () => {
 const payload={listing:{id:'item-1',title:'Drill',availabilityStatus:'reserved'},activeTransactionId:'current',requests:[item]};
 api.getRequestQueue.mockResolvedValue(payload);
 api.declineRental.mockResolvedValue({});
 const screen=render(<Screen route={{params:{listingId:'item-1'}}} navigation={navigation}/>);
 fireEvent.press(await screen.findByLabelText("Decline Alex's request"));
 expect(api.declineRental).not.toHaveBeenCalled();
 fireEvent.press(screen.getByLabelText('Close confirmation'));
 expect(api.declineRental).not.toHaveBeenCalled();
 fireEvent.press(screen.getByLabelText("Decline Alex's request"));
 api.getRequestQueue.mockResolvedValue({...payload,requests:[]});
 fireEvent.press(screen.getByTestId('Queue.confirmDecline'));
 await screen.findByText('No requests waiting.');
 expect(api.declineRental).toHaveBeenCalledTimes(1);
 expect(api.declineRental).toHaveBeenCalledWith('request-1');
 expect(api.approveRental).not.toHaveBeenCalled();
 expect(navigation.replace).not.toHaveBeenCalled();
});

it('ignores repeated approval taps and advances straight to the exchange', async () => {
 let finish;
 api.approveRental.mockImplementationOnce(() => new Promise(resolve => {finish=resolve;}));
 const screen=render(<Screen route={{params:{listingId:'item-1'}}} navigation={navigation}/>);
 const approve=await screen.findByLabelText("Approve Alex's request");
 act(() => {fireEvent.press(approve);fireEvent.press(approve);});
 expect(api.approveRental).toHaveBeenCalledTimes(1);
 await act(async () => finish({}));
 expect(navigation.replace).toHaveBeenCalledTimes(1);
 expect(navigation.replace).toHaveBeenCalledWith('TransactionDetail',{id:'request-1'});
});

it('refreshes an approval conflict, keeps waiting requests visible and disables approval', async () => {
 api.approveRental.mockRejectedValueOnce(new Error('Already reserved'));
 const screen=render(<Screen route={{params:{listingId:'item-1'}}} navigation={navigation}/>);
 const approve=await screen.findByLabelText("Approve Alex's request");
 api.getRequestQueue.mockResolvedValue({listing:{id:'item-1',title:'Drill',availabilityStatus:'reserved'},requests:[{...item,canChoose:false}],activeTransactionId:'other'});
 fireEvent.press(approve);
 await waitFor(() => expect(screen.getByLabelText("Approve Alex's request")).toBeDisabled());
 expect(screen.getByText('Alex')).toBeTruthy();
 expect(screen.getByLabelText("Decline Alex's request")).not.toBeDisabled();
 expect(navigation.replace).not.toHaveBeenCalled();
});

it('retains a successful decline when the following refresh fails', async () => {
 api.declineRental.mockResolvedValue({});
 const screen=render(<Screen route={{params:{listingId:'item-1'}}} navigation={navigation}/>);
 fireEvent.press(await screen.findByLabelText("Decline Alex's request"));
 api.getRequestQueue.mockRejectedValueOnce(new Error('offline'));
 fireEvent.press(screen.getByTestId('Queue.confirmDecline'));
 await screen.findByText('Couldn’t refresh. Pull down to try again.');
 expect(screen.queryByText('Alex')).toBeNull();
 expect(api.declineRental).toHaveBeenCalledTimes(1);
});

const anotherItem={...item,id:'request-2',borrower:{...item.borrower,id:'neighbor-2',firstName:'Bea'}};
const anotherQueue={listing:{id:'item-2',title:'Ladder',isAvailable:true,status:'active'},requests:[anotherItem]};
const deferred=()=>{
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
};
const queueElement=listingId=><Screen route={{params:{listingId}}} navigation={navigation}/>;

it('hides the previous item immediately when another queue is loading or unavailable', async () => {
 const next=deferred();
 const screen=render(queueElement('item-1'));
 await screen.findByText('Alex');
 api.getRequestQueue.mockReturnValueOnce(next.promise);
 screen.rerender(queueElement('item-2'));
 expect(screen.queryByText('Drill')).toBeNull();
 expect(screen.queryByLabelText("Approve Alex's request")).toBeNull();
 expect(screen.queryByLabelText('Message Alex')).toBeNull();
 await act(async()=>next.reject(new Error('offline')));
 expect(screen.getByText('Couldn’t load requests. Tap to retry.')).toBeTruthy();
 expect(screen.queryByText('Alex')).toBeNull();
 api.getRequestQueue.mockResolvedValueOnce(anotherQueue);
 fireEvent.press(screen.getByText('Couldn’t load requests. Tap to retry.'));
 fireEvent.press(await screen.findByLabelText('Message Bea'));
 expect(navigation.navigate).toHaveBeenCalledWith('Chat',expect.objectContaining({recipientId:'neighbor-2',listingId:'item-2',listing:anotherQueue.listing}));
});

it.each(['resolve','reject'])('ignores an old queue load that later %ss after switching items', async outcome => {
 const old=deferred();
 api.getRequestQueue.mockReturnValueOnce(old.promise).mockResolvedValueOnce(anotherQueue);
 const screen=render(queueElement('item-1'));
 screen.rerender(queueElement('item-2'));
 await screen.findByText('Bea');
 await act(async()=>old[outcome](outcome==='resolve'
  ? {listing:{id:'item-1',title:'Drill'},requests:[item]} : new Error('old request failed')));
 expect(screen.getByText('Ladder')).toBeTruthy();
 expect(screen.queryByText('Alex')).toBeNull();
 expect(screen.queryByRole('alert')).toBeNull();
 expect(screen.getByLabelText("Approve Bea's request")).not.toBeDisabled();
});

it('keeps the newest refresh when responses arrive out of order', async () => {
 const old=deferred(),latest=deferred();
 const screen=render(queueElement('item-1'));
 await screen.findByText('Alex');
 api.getRequestQueue.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
 act(()=>screen.UNSAFE_getByType(RefreshControl).props.onRefresh());
 act(()=>screen.UNSAFE_getByType(RefreshControl).props.onRefresh());
 const listing={id:'item-1',title:'Drill',isAvailable:true,status:'active'};
 await act(async()=>latest.resolve({listing,requests:[anotherItem]}));
 await act(async()=>old.resolve({listing,requests:[item]}));
 expect(screen.getByText('Bea')).toBeTruthy();
 expect(screen.queryByText('Alex')).toBeNull();
});

it('ignores a blurred focus session even after returning to the same queue', async () => {
 const old=deferred();
 api.getRequestQueue.mockReturnValueOnce(old.promise);
 const screen=render(queueElement('item-1'));
 mockQueueFocused=false;
 screen.rerender(queueElement('item-1'));
 api.getRequestQueue.mockResolvedValueOnce({listing:{id:'item-1',title:'Drill',isAvailable:true,status:'active'},requests:[anotherItem]});
 mockQueueFocused=true;
 screen.rerender(queueElement('item-1'));
 await screen.findByText('Bea');
 await act(async()=>old.reject(new Error('old focus failed')));
 expect(screen.queryByRole('alert')).toBeNull();
 expect(screen.getByLabelText("Approve Bea's request")).not.toBeDisabled();
});

it.each(['resolve','reject'])('does not change another queue when an earlier decision later %ss', async outcome => {
 const old=deferred();
 api.approveRental.mockReturnValueOnce(old.promise);
 const screen=render(queueElement('item-1'));
 fireEvent.press(await screen.findByLabelText("Approve Alex's request"));
 api.getRequestQueue.mockResolvedValueOnce(anotherQueue);
 screen.rerender(queueElement('item-2'));
 await screen.findByText('Bea');
 await act(async()=>old[outcome](outcome==='resolve' ? {} : new Error('old approval failed')));
 expect(screen.getByText('Ladder')).toBeTruthy();
 expect(screen.getByLabelText("Approve Bea's request")).not.toBeDisabled();
 expect(api.getRequestQueue.mock.calls).toEqual([['item-1'],['item-2']]);
 expect(navigation.replace).not.toHaveBeenCalled();
 expect(mockShowToast).not.toHaveBeenCalled();
 expect(mockShowError).not.toHaveBeenCalled();
});
