import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ContentSafetyActions from '../../../src/components/ContentSafetyActions';
import api from '../../../src/services/api';
jest.mock('../../../src/context/AuthContext',()=>({useAuth:()=>({user:{id:'viewer'}})}));
beforeEach(()=>{api.getContentReportStatus.mockResolvedValue({submitted:false});jest.clearAllMocks();api.reportContent.mockResolvedValue({ok:true});api.blockContentAuthor.mockResolvedValue({ok:true});});
it('reports a masked Town post by content ID without needing or exposing its author',async()=>{
  const screen=render(<ContentSafetyActions type="listing" id="masked-post" />);
  fireEvent.press(screen.getByText('Report or block'));fireEvent.press(await screen.findByText('Report content'));
  fireEvent.press(screen.getByText('Inappropriate content'));await screen.findAllByText('Report submitted');
  expect(api.reportContent).toHaveBeenCalledWith('listing','masked-post','Inappropriate content');
  expect(api.blockContentAuthor).not.toHaveBeenCalled();
});
it('requires confirmation before blocking a content author and refreshes only after success',async()=>{
  const changed=jest.fn();const screen=render(<ContentSafetyActions type="discussion" id="comment" onBlocked={changed} />);
  fireEvent.press(screen.getByText('Report or block'));fireEvent.press(screen.getByText('Block this neighbor'));
  expect(api.blockContentAuthor).not.toHaveBeenCalled();fireEvent.press(screen.getByText('Block neighbor'));
  await screen.findByText('Neighbor blocked');expect(api.blockContentAuthor).toHaveBeenCalledWith('discussion','comment');expect(changed).toHaveBeenCalledTimes(1);
});
it('does not claim a report succeeded when the server rejects it',async()=>{
  api.reportContent.mockRejectedValueOnce(new Error('This content is no longer available.'));
  const screen=render(<ContentSafetyActions type="request" id="wanted" open />);
  fireEvent.press(await screen.findByText('Report content'));fireEvent.press(screen.getByText('Harassment'));
  await screen.findByText('Please try again');expect(screen.queryByText('Report submitted')).toBeNull();
});

it('keeps staged dialogs open and closes the parent only when the final feedback is dismissed', async () => {
  const closed=jest.fn(); const screen=render(<ContentSafetyActions type="discussion" id="comment" open onClose={closed} />);
  fireEvent.press(await screen.findByText('Report content'));
  expect(closed).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Harassment'));
  await screen.findAllByText('Report submitted');
  expect(closed).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Done'));
  expect(closed).toHaveBeenCalledTimes(1);
});

it('remembers submission after reopening and remounting without allowing another report',async()=>{
 const screen=render(<ContentSafetyActions type="listing" id="once" />);
 fireEvent.press(screen.getByText('Report or block'));
 fireEvent.press(await screen.findByText('Report content'));
 fireEvent.press(screen.getByText('Harassment'));
 await screen.findByText('Done');fireEvent.press(screen.getByText('Done'));
 fireEvent.press(screen.getByText('Report submitted'));
 expect(screen.getAllByText('Report submitted')).toHaveLength(2);
 fireEvent.press(screen.getByRole('button',{name:'Report submitted',disabled:true}));
 expect(api.reportContent).toHaveBeenCalledTimes(1);
 screen.unmount();api.getContentReportStatus.mockResolvedValueOnce({submitted:true});
 const remounted=render(<ContentSafetyActions type="listing" id="once" open />);
 expect(await remounted.findByRole('button',{name:'Report submitted',disabled:true})).toBeTruthy();
 expect(remounted.queryByText('Report content')).toBeNull();
});
it('keeps reporting unavailable if status cannot be checked, then retries',async()=>{
 api.getContentReportStatus.mockRejectedValueOnce(new Error('Offline'));
 const screen=render(<ContentSafetyActions type="request" id="retry" open />);
 fireEvent.press(await screen.findByText('Retry report status'));
 await screen.findByText('Report content');expect(api.reportContent).not.toHaveBeenCalled();
});
