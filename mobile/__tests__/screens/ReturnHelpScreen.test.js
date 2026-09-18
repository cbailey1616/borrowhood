import React from 'react';
import {render,fireEvent,waitFor} from '@testing-library/react-native';
import api from '../../src/services/api';
import Screen from '../../src/screens/ReturnHelpScreen';
const mockUser={id:'borrower',isAdmin:false};
jest.mock('../../src/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
const navigation={navigate:jest.fn(),goBack:jest.fn()};
const report={id:'report',transaction_id:'exchange',title:'Ladder',owner_name:'Owner',borrower_name:'Borrower',borrower_id:'borrower',status:'open',version:3,detail:'The ladder is missing.',response_due_at:'2026-09-20T12:00:00Z',history:[]};
beforeEach(()=>{jest.clearAllMocks();mockUser.isAdmin=false;api.getReturnHelp.mockResolvedValue({reports:[report],restriction:null,page:1,hasMore:false});});
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
