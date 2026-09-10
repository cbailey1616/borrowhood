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
 expect(onSaved).toHaveBeenCalled();
});
it('does not offer voting again after submission',()=>{
 const screen=render(<ExchangeEndorsement transaction={{id:'exchange',endorsement:{submitted:true,positive:true}}}/>);
 expect(screen.getByText('Your thumbs up is saved.')).toBeTruthy();
 expect(screen.queryByLabelText('Thumbs down')).toBeNull();
});
it('submits an explicit neutral response and shows it as saved',async()=>{
 const onSaved=jest.fn();
 const screen=render(<ExchangeEndorsement transaction={{id:'exchange',endorsement:{canRate:true}}} onSaved={onSaved}/>);
 fireEvent.press(screen.getByLabelText('Neutral'));
 expect(screen.getByLabelText('Send endorsement')).not.toBeDisabled();
 fireEvent.press(screen.getByLabelText('Send endorsement'));
 await waitFor(()=>expect(api.endorseTransaction).toHaveBeenCalledWith('exchange',null));
 expect(onSaved).toHaveBeenCalled();
 screen.rerender(<ExchangeEndorsement transaction={{id:'exchange',endorsement:{submitted:true,positive:null}}} onSaved={onSaved}/>);
 expect(screen.getByText('Your neutral feedback is saved.')).toBeTruthy();
 expect(screen.queryByLabelText('Send endorsement')).toBeNull();
});

jest.mock('../../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
