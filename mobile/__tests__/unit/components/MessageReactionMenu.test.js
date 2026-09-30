import React from 'react';
import { Modal } from 'react-native';
import { render,fireEvent } from '@testing-library/react-native';
import MessageReactionMenu from '../../../src/components/MessageReactionMenu';
import EmojiReactionPicker from '../../../src/components/EmojiReactionPicker';
it('keeps a thread reaction picker on screen and waits for native dismissal before opening actions',()=>{
 const more=jest.fn(),close=jest.fn();
 const screen=render(<MessageReactionMenu visible position={{y:-100}} onClose={close} onMore={more}/>);
 expect(screen.UNSAFE_getByType(EmojiReactionPicker).props.style.top).toBeGreaterThanOrEqual(12);
 fireEvent.press(screen.getByLabelText('More message actions'));expect(close).toHaveBeenCalled();expect(more).not.toHaveBeenCalled();
 fireEvent(screen.UNSAFE_getByType(Modal),'dismiss');expect(more).toHaveBeenCalledTimes(1);
 fireEvent(screen.UNSAFE_getByType(Modal),'dismiss');expect(more).toHaveBeenCalledTimes(1);
});
