import React from 'react';
import { render,fireEvent,waitFor } from '@testing-library/react-native';
import api from '../../../src/services/api';
import ExchangeEndorsement from '../../../src/components/ExchangeEndorsement';
beforeEach(()=>{api.endorseTransaction=jest.fn().mockResolvedValue({success:true});});
it('requires a selection and submits the actual thumbs-down vote',async()=>{
 const onSaved=jest.fn();const screen=render(<ExchangeEndorsement transaction={{id:'exchange',endorsement:{canRate:true}}} onSaved={onSaved}/>);
 expect(screen.getByLabelText('Send endorsement')).toBeDisabled();
 fireEvent.press(screen.getByLabelText('Thumbs down'));
 fireEvent.press(screen.getByLabelText('Send endorsement'));
 await waitFor(()=>expect(api.endorseTransaction).toHaveBeenCalledWith('exchange',false));
 await waitFor(()=>expect(onSaved).toHaveBeenCalled());
});
it('does not offer voting again after submission',()=>{
 const screen=render(<ExchangeEndorsement transaction={{id:'exchange',endorsement:{submitted:true,positive:true}}}/>);
 expect(screen.getByText('Endorsement sent')).toBeTruthy();
 expect(screen.getByText('Thumbs up')).toBeTruthy();
 expect(screen.queryByLabelText('Thumbs down')).toBeNull();
});
it('submits an explicit neutral response and shows it as saved',async()=>{
 const onSaved=jest.fn();
 const screen=render(<ExchangeEndorsement transaction={{id:'exchange',endorsement:{canRate:true}}} onSaved={onSaved}/>);
 fireEvent.press(screen.getByLabelText('Neutral'));
 expect(screen.getByLabelText('Send endorsement')).not.toBeDisabled();
 fireEvent.press(screen.getByLabelText('Send endorsement'));
 await waitFor(()=>expect(api.endorseTransaction).toHaveBeenCalledWith('exchange',null));
 await waitFor(()=>expect(onSaved).toHaveBeenCalled());
 screen.rerender(<ExchangeEndorsement transaction={{id:'exchange',endorsement:{submitted:true,positive:null}}} onSaved={onSaved}/>);
 expect(screen.getByText('Endorsement sent')).toBeTruthy();
 expect(screen.getByText('Neutral')).toBeTruthy();
 expect(screen.queryByLabelText('Send endorsement')).toBeNull();
});

it('keeps the sent state when refreshing the exchange fails',async()=>{
 const onSaved=jest.fn().mockRejectedValue(new Error('Offline'));
 const transaction={id:'exchange',endorsement:{canRate:true}};
 const screen=render(<ExchangeEndorsement transaction={transaction} onSaved={onSaved} embedded/>);
 fireEvent.press(screen.getByLabelText('Thumbs up'));
 fireEvent.press(screen.getByLabelText('Send endorsement'));
 await screen.findByText('Endorsement sent');
 screen.rerender(<ExchangeEndorsement transaction={{...transaction}} onSaved={onSaved} embedded/>);
 expect(screen.queryByLabelText('Send endorsement')).toBeNull();
 expect(screen.queryByText(/can’t be changed/)).toBeNull();
 expect(api.endorseTransaction).toHaveBeenCalledTimes(1);
});

it('preserves the selection for retry after a failed submission',async()=>{
 api.endorseTransaction.mockRejectedValueOnce(new Error('Offline'));
 const onSaved=jest.fn();
 const screen=render(<ExchangeEndorsement transaction={{id:'exchange',endorsement:{canRate:true}}} onSaved={onSaved}/>);
 fireEvent.press(screen.getByLabelText('Thumbs down'));
 fireEvent.press(screen.getByLabelText('Send endorsement'));
 await waitFor(()=>expect(screen.getByLabelText('Send endorsement')).not.toBeDisabled());
 expect(screen.queryByText('Endorsement sent')).toBeNull();
 expect(onSaved).not.toHaveBeenCalled();
 fireEvent.press(screen.getByLabelText('Send endorsement'));
 await screen.findByText('Endorsement sent');
 expect(api.endorseTransaction).toHaveBeenNthCalledWith(2,'exchange',false);
});

it('does not carry a selected endorsement to another exchange',()=>{
 const screen=render(<ExchangeEndorsement transaction={{id:'first',endorsement:{canRate:true}}}/>);
 fireEvent.press(screen.getByLabelText('Thumbs up'));
 screen.rerender(<ExchangeEndorsement transaction={{id:'second',endorsement:{canRate:true}}}/>);
 expect(screen.getByLabelText('Send endorsement')).toBeDisabled();
 expect(screen.getByLabelText('Thumbs up').props.accessibilityState.selected).toBe(false);
});

it('does not offer an endorsement without server eligibility',()=>{
 const screen=render(<ExchangeEndorsement transaction={{id:'exchange',endorsement:{canRate:false,submitted:false}}}/>);
 expect(screen.queryByText('Leave an endorsement')).toBeNull();
 expect(screen.queryByLabelText('Send endorsement')).toBeNull();
});

jest.mock('../../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
