import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ContentSafetyActions from '../../../src/components/ContentSafetyActions';
import api from '../../../src/services/api';
beforeEach(()=>{jest.clearAllMocks();api.reportContent.mockResolvedValue({ok:true});api.blockContentAuthor.mockResolvedValue({ok:true});});
it('reports a masked Town post by content ID without needing or exposing its author',async()=>{
  const screen=render(<ContentSafetyActions type="listing" id="masked-post" />);
  fireEvent.press(screen.getByText('Report or block'));fireEvent.press(screen.getByText('Report content'));
  fireEvent.press(screen.getByText('Inappropriate content'));await screen.findByText('Report received');
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
  fireEvent.press(screen.getByText('Report content'));fireEvent.press(screen.getByText('Harassment'));
  await screen.findByText('Please try again');expect(screen.queryByText('Report received')).toBeNull();
});
