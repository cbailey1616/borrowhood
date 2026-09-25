import React from 'react';
import { RefreshControl } from 'react-native';
import {render,fireEvent,waitFor,act} from '@testing-library/react-native';
import {useFocusEffect} from '@react-navigation/native';
import api from '../../src/services/api';
import Screen from '../../src/screens/ReturnHelpScreen';
const mockUser={id:'borrower',isAdmin:false};
jest.mock('../../src/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
const navigation={navigate:jest.fn(),goBack:jest.fn()};
const report={id:'report',transaction_id:'exchange',title:'Ladder',owner_name:'Owner',borrower_name:'Borrower',borrower_id:'borrower',status:'open',version:3,detail:'The ladder is missing.',response_due_at:'2026-09-20T12:00:00Z',history:[]};
beforeEach(()=>{
 jest.clearAllMocks();jest.useFakeTimers();jest.setSystemTime(new Date('2026-09-25T16:00:00Z'));
 useFocusEffect.mockImplementation(callback=>React.useEffect(callback,[callback]));
 mockUser.id='borrower';mockUser.isAdmin=false;
 api.getConversations.mockResolvedValue([]);
 api.getReturnHelp.mockResolvedValue({reports:[report],restriction:null,page:1,hasMore:false});
});
afterEach(()=>jest.useRealTimers());
it('lets the borrower respond only after confirming, with the current case version',async()=>{
 const s=render(<Screen route={{params:{}}} navigation={navigation}/>);
 fireEvent.press(await s.findByText('Respond'));
 fireEvent.changeText(s.getByLabelText('Return details'),'We agreed I could return it tomorrow.');
 fireEvent.press(s.getByText('Send response'));
 expect(api.respondReturnReport).not.toHaveBeenCalled();
 fireEvent.press(s.getByText('Confirm'));
 await waitFor(()=>expect(api.respondReturnReport).toHaveBeenCalledWith('report','We agreed I could return it tomorrow.',3,false));
});
it('keeps a failed response editable and displays the server error',async()=>{
 api.respondReturnReport.mockRejectedValueOnce(new Error('This report changed. Refresh before responding.'));
 const s=render(<Screen route={{params:{}}} navigation={navigation}/>);
 fireEvent.press(await s.findByText('Respond'));fireEvent.changeText(s.getByLabelText('Return details'),'The item is ready for return.');
 fireEvent.press(s.getByText('Send response'));fireEvent.press(s.getByText('Confirm'));
 expect(await s.findByText('This report changed. Refresh before responding.')).toBeTruthy();
 expect(s.getByLabelText('Return details').props.value).toBe('The item is ready for return.');
});
it('does not expose administrative reviews from a forged route parameter',async()=>{
 const s=render(<Screen route={{params:{admin:true}}} navigation={navigation}/>);
 await s.findByText('Ladder');expect(api.getReturnHelp).toHaveBeenCalledWith(false,1,undefined);expect(s.queryByText('Review')).toBeNull();
});
it('keeps an appeal available during a permanent borrowing restriction',async()=>{
 api.getReturnHelp.mockResolvedValue({reports:[{...report,status:'confirmed'}],restriction:{state:'permanent'},page:1,hasMore:false});
 const s=render(<Screen route={{params:{}}} navigation={navigation}/>);
 expect(await s.findByText('Appeal decision')).toBeTruthy();fireEvent.press(s.getByText('View exchange'));
 expect(navigation.navigate).toHaveBeenCalledWith('TransactionDetail',{id:'exchange'});
});

const ownerExchange={id:'exchange',isLender:true,isBorrower:false,status:'picked_up',actualPickupAt:'2026-09-25T12:00:00Z',endDate:'2026-09-27',listing:{id:'listing',title:'Ladder',listingType:'lend',photos:[]},lender:{id:'owner',firstName:'Taylor'},borrower:{id:'borrower',firstName:'Alex'}};
const borrowerExchange={...ownerExchange,isLender:false,isBorrower:true};
const noReports={reports:[],restriction:null,page:1,hasMore:false};
it('opens the report card and sends only after the owner confirms',async()=>{
 mockUser.id='owner';
 api.getTransaction.mockResolvedValue({...ownerExchange,endDate:'2026-09-24'});
 api.getReturnHelp.mockResolvedValue({reports:[],restriction:null,page:1,hasMore:false});
 const s=render(<Screen route={{params:{transaction:ownerExchange}}} navigation={navigation}/>);
 fireEvent.press(await s.findByRole('button',{name:'Item not returned'}));
 fireEvent.changeText(s.getByLabelText('Return details'),'The agreed return did not happen.');
 fireEvent.press(s.getByRole('button',{name:'Send report'}));
 expect(api.reportNonReturn).not.toHaveBeenCalled();
 fireEvent.press(s.getByText('Confirm'));
 await waitFor(()=>expect(api.reportNonReturn).toHaveBeenCalledWith('exchange','The agreed return did not happen.'));
});

it('shows both dates and saves an extension once from its explicit save button',async()=>{
 mockUser.id='owner';
 api.getTransaction.mockResolvedValue({...ownerExchange,endDate:'2026-09-28'}).mockResolvedValueOnce(ownerExchange);
 api.getReturnHelp.mockResolvedValue({reports:[],restriction:null,page:1,hasMore:false});
 const s=render(<Screen route={{params:{transaction:ownerExchange}}} navigation={navigation}/>);
 fireEvent.press(await s.findByRole('button',{name:'Give more time'}));
 expect(s.getByText('Sun, Sep 27, 2026')).toBeTruthy();
 expect(s.getByText('Mon, Sep 28, 2026')).toBeTruthy();
 expect(s.queryByRole('button',{name:'Refresh reports'})).toBeNull();
 expect(s.queryByRole('button',{name:'How return reports work'})).toBeNull();
 expect(api.extendReturn).not.toHaveBeenCalled();
 fireEvent.press(s.getByRole('button',{name:'Save return date'}));
 expect(s.queryByText('Save this return date?')).toBeNull();
 await waitFor(()=>expect(api.extendReturn).toHaveBeenCalledWith('exchange','2026-09-28'));
 expect(await s.findByText('Return date saved: Mon, Sep 28, 2026.')).toBeTruthy();
 expect(await s.findByText('Return by Mon, Sep 28')).toBeTruthy();
 expect(api.extendReturn).toHaveBeenCalledTimes(1);
});

it('keeps a chosen extension editable after a failed save and preserves it when the picker is dismissed',async()=>{
 api.getTransaction.mockResolvedValue(ownerExchange);api.getReturnHelp.mockResolvedValue(noReports);
 api.extendReturn.mockRejectedValueOnce(new Error('Could not save the return date.'));
 const s=render(<Screen route={{params:{transaction:ownerExchange}}} navigation={navigation}/>);
 fireEvent.press(await s.findByRole('button',{name:'Give more time'}));
 fireEvent.press(s.getByRole('button',{name:/Change return date/}));
 const picker=s.getByLabelText('New return date');
 expect(picker.props.minimumDate).toEqual(new Date(2026,8,28,12));
 expect(picker.props.maximumDate).toEqual(new Date(2026,11,24,12));
 fireEvent(picker,'onChange',{type:'set'},new Date(2026,8,30));
 fireEvent(picker,'onChange',{type:'dismissed'},new Date(2026,9,1));
 fireEvent.press(s.getByRole('button',{name:'Save return date'}));
 expect(await s.findByText('Could not save the return date.')).toBeTruthy();
 expect(api.extendReturn).toHaveBeenCalledWith('exchange','2026-09-30');
 expect(s.getByRole('button',{name:/Change return date, Wed, Sep 30/})).not.toBeDisabled();
 fireEvent.press(s.getByRole('button',{name:'Cancel'}));
 expect(await s.findByRole('button',{name:'Give more time'})).toBeTruthy();
 expect(api.extendReturn).toHaveBeenCalledTimes(1);
});

it('prevents duplicate date updates and locks editing while a save is pending',async()=>{
 api.getTransaction.mockResolvedValue(ownerExchange);api.getReturnHelp.mockResolvedValue(noReports);
 let finishSave;api.extendReturn.mockReturnValueOnce(new Promise(resolve=>{finishSave=resolve;}));
 const s=render(<Screen route={{params:{transaction:ownerExchange}}} navigation={navigation}/>);
 fireEvent.press(await s.findByRole('button',{name:'Give more time'}));
 const save=s.getByRole('button',{name:'Save return date'});
 fireEvent.press(save);fireEvent.press(save);
 expect(api.extendReturn).toHaveBeenCalledTimes(1);
 expect(s.getByRole('button',{name:'Cancel'})).toBeDisabled();
 expect(s.getByRole('button',{name:/Change return date/})).toBeDisabled();
 await act(async()=>{finishSave({ok:true});});
});

it('does not offer an invalid extension when the return is already at the 90-day limit',async()=>{
 api.getTransaction.mockResolvedValue({...ownerExchange,endDate:'2026-12-24'});api.getReturnHelp.mockResolvedValue(noReports);
 const s=render(<Screen route={{params:{transaction:ownerExchange}}} navigation={navigation}/>);
 fireEvent.press(await s.findByRole('button',{name:'Give more time'}));
 expect(s.getByRole('button',{name:'Save return date'})).toBeDisabled();
 expect(s.queryByRole('button',{name:/Change return date/})).toBeNull();
 fireEvent.press(s.getByRole('button',{name:'Cancel'}));
 expect(api.extendReturn).not.toHaveBeenCalled();
});

it('gives borrowers useful next steps even when no reports exist',async()=>{
 api.getTransaction.mockResolvedValue(borrowerExchange);api.getReturnHelp.mockResolvedValue(noReports);
 api.getConversations.mockResolvedValue([{id:'chat',otherUser:{id:'owner'}}]);
 const s=render(<Screen route={{params:{transaction:borrowerExchange}}} navigation={navigation}/>);
 expect(await s.findByText('Return by Sun, Sep 27')).toBeTruthy();
 expect(s.queryByText('No reports for this return')).toBeNull();
 expect(s.queryByRole('button',{name:'Refresh reports'})).toBeNull();
 expect(s.queryByRole('button',{name:'How return reports work'})).toBeNull();
 expect(s.queryByRole('button',{name:'Give more time'})).toBeNull();
 expect(s.queryByRole('button',{name:'Item not returned'})).toBeNull();
 fireEvent.press(s.getByRole('button',{name:'Message Taylor'}));
 await waitFor(()=>expect(navigation.navigate).toHaveBeenCalledWith('Chat',expect.objectContaining({
  recipientId:'owner',conversationId:'chat',listingId:'listing',threadContext:{id:'listing',title:'Ladder',type:'listing'},
 })));
 fireEvent.press(s.getByRole('button',{name:'View exchange'}));
 expect(navigation.navigate).toHaveBeenCalledWith('TransactionDetail',{id:'exchange'});
 expect(api.confirmRentalReturn).not.toHaveBeenCalled();
});

it('lets a borrower ask for more time without changing dates or sending a message automatically',async()=>{
 api.getTransaction.mockResolvedValue(borrowerExchange);api.getReturnHelp.mockResolvedValue(noReports);
 api.getConversations.mockRejectedValueOnce(new Error('Offline'));
 const s=render(<Screen route={{params:{transaction:borrowerExchange}}} navigation={navigation}/>);
 fireEvent.press(await s.findByRole('button',{name:'Need more time?'}));
 await waitFor(()=>expect(navigation.navigate).toHaveBeenCalledWith('Chat',expect.objectContaining({recipientId:'owner',listingId:'listing'})));
 expect(api.extendReturn).not.toHaveBeenCalled();expect(api.sendMessage).not.toHaveBeenCalled();
});

it('does not offer a non-return report before the agreed date has passed',async()=>{
 api.getTransaction.mockResolvedValue(ownerExchange);api.getReturnHelp.mockResolvedValue(noReports);
 const s=render(<Screen route={{params:{transaction:ownerExchange}}} navigation={navigation}/>);
 expect(await s.findByRole('button',{name:'Give more time'})).toBeTruthy();
 expect(s.queryByRole('button',{name:'Item not returned'})).toBeNull();
});

it('does not offer duplicate reports for an already reported missing return',async()=>{
 api.getTransaction.mockResolvedValue({...ownerExchange,endDate:'2026-09-24'});
 const s=render(<Screen route={{params:{transaction:ownerExchange}}} navigation={navigation}/>);
 await s.findByText('Return date has passed');
 expect(s.queryByRole('button',{name:'Item not returned'})).toBeNull();
});

it('offers a new report only for a missed later deadline after dismissal',async()=>{
 api.getTransaction.mockResolvedValue({...ownerExchange,endDate:'2026-09-24'});
 api.getReturnHelp.mockResolvedValue({...noReports,reports:[{...report,status:'dismissed',reported_due_date:'2026-09-22',due_date:'2026-09-24'}]});
 const s=render(<Screen route={{params:{transaction:ownerExchange}}} navigation={navigation}/>);
 expect(await s.findByRole('button',{name:'Item not returned'})).toBeTruthy();
});

it('keeps messaging available during a borrowing restriction',async()=>{
 api.getTransaction.mockResolvedValue(borrowerExchange);
 api.getReturnHelp.mockResolvedValue({...noReports,restriction:{state:'permanent'}});
 const s=render(<Screen route={{params:{transaction:borrowerExchange}}} navigation={navigation}/>);
 await s.findByText('Borrowing paused');
 fireEvent.press(s.getByRole('button',{name:'Message Taylor'}));
 await waitFor(()=>expect(navigation.navigate).toHaveBeenCalledWith('Chat',expect.objectContaining({recipientId:'owner'})));
});

it('refreshes the return status when coming back from the exchange',async()=>{
 api.getTransaction.mockResolvedValue(borrowerExchange);api.getReturnHelp.mockResolvedValue(noReports);
 const s=render(<Screen route={{params:{transaction:borrowerExchange}}} navigation={navigation}/>);
 await s.findByRole('button',{name:'Need more time?'});
 api.getTransaction.mockResolvedValue({...borrowerExchange,status:'return_pending'});
 act(()=>{useFocusEffect.mock.calls.at(-1)[0]();});
 expect(await s.findByText('Waiting for the owner')).toBeTruthy();
 expect(s.queryByRole('button',{name:'Need more time?'})).toBeNull();
});

it('does not reopen chat after leaving the screen during a lookup',async()=>{
 api.getTransaction.mockResolvedValue(borrowerExchange);api.getReturnHelp.mockResolvedValue(noReports);
 let resolveConversations;api.getConversations.mockReturnValueOnce(new Promise(resolve=>{resolveConversations=resolve;}));
 const s=render(<Screen route={{params:{transaction:borrowerExchange}}} navigation={navigation}/>);
 fireEvent.press(await s.findByRole('button',{name:'Message Taylor'}));
 s.unmount();
 await act(async()=>{resolveConversations([]);});
 expect(navigation.navigate).not.toHaveBeenCalled();
});

it('offers an exchange destination from the profile entry point',async()=>{
 api.getReturnHelp.mockResolvedValue(noReports);
 const s=render(<Screen route={{params:{}}} navigation={navigation}/>);
 fireEvent.press(await s.findByRole('button',{name:'View my exchanges'}));
 expect(navigation.navigate).toHaveBeenCalledWith('Main',{screen:'Activity',params:{tab:'activity'}});
});

it('shows a retry instead of claiming there are no reports when loading fails',async()=>{
 api.getReturnHelp.mockRejectedValueOnce(new Error('Could not load return help.'));
 api.getTransaction.mockResolvedValue(borrowerExchange);
 const s=render(<Screen route={{params:{transaction:borrowerExchange}}} navigation={navigation}/>);
 const retry=await s.findByRole('button',{name:'Try again'});
 expect(s.queryByText('No reports for this return')).toBeNull();
 fireEvent.press(retry);
 await s.findByRole('button',{name:'Message Taylor'});
 expect(api.getReturnHelp).toHaveBeenCalledTimes(2);
});

it('keeps policy collapsed until requested when there is a return report',async()=>{
 const s=render(<Screen route={{params:{}}} navigation={navigation}/>);
 await s.findByRole('button',{name:'Respond'});
 expect(s.queryByText('Existing messages and returns stay available during borrowing restrictions.')).toBeNull();
 fireEvent.press(s.getByRole('button',{name:'How return reports work'}));
 expect(s.getByText('Existing messages and returns stay available during borrowing restrictions.')).toBeTruthy();
});

it('does not show an empty options section for an unavailable neighbor',async()=>{
 api.getTransaction.mockResolvedValue({...borrowerExchange,status:'account_deleted'});api.getReturnHelp.mockResolvedValue(noReports);
 const s=render(<Screen route={{params:{transaction:borrowerExchange}}} navigation={navigation}/>);
 expect(await s.findByRole('button',{name:'View exchange'})).toBeTruthy();
 expect(s.queryByText('Return options')).toBeNull();
 expect(s.queryByRole('button',{name:'Message Taylor'})).toBeNull();
});

it('keeps details visible but disables actions while refreshing',async()=>{
 api.getTransaction.mockResolvedValue(borrowerExchange);api.getReturnHelp.mockResolvedValue(noReports);
 const s=render(<Screen route={{params:{transaction:borrowerExchange}}} navigation={navigation}/>);
 await s.findByText('Return by Sun, Sep 27');
 let resolveRefresh;api.getReturnHelp.mockReturnValueOnce(new Promise(resolve=>{resolveRefresh=resolve;}));
 fireEvent(s.UNSAFE_getByType(RefreshControl),'refresh');
 expect(s.getByText('Return by Sun, Sep 27')).toBeTruthy();
 expect(s.getByRole('button',{name:'Message Taylor'})).toBeDisabled();
 expect(s.getByRole('button',{name:'Need more time?'})).toBeDisabled();
 await act(async()=>{resolveRefresh(noReports);});
 expect(s.getByRole('button',{name:'Message Taylor'})).not.toBeDisabled();
});
