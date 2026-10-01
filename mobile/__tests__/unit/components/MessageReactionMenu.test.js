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

it('uses the same full grid and geometry in default and comments menus', () => {
 const { REACTION_OPTIONS, reactionPickerHeight } = require('../../../src/utils/reactions');
 const defaultMenu = render(<MessageReactionMenu visible position={{y:600}} onClose={jest.fn()} onSelect={jest.fn()}/>);
 const explicitMenu = render(<MessageReactionMenu visible options={REACTION_OPTIONS} position={{y:600}} onClose={jest.fn()} onSelect={jest.fn()}/>);
 expect(defaultMenu.UNSAFE_getByType(EmojiReactionPicker).props.style).toEqual(explicitMenu.UNSAFE_getByType(EmojiReactionPicker).props.style);
 expect(defaultMenu.getAllByRole('button').filter(button=>button.props.accessibilityLabel.startsWith('React:'))).toHaveLength(19);
 expect(reactionPickerHeight()).toBe(202);
 expect(reactionPickerHeight(19,true)).toBe(246);
});
