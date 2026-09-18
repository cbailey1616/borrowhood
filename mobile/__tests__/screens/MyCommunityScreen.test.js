import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../src/services/api';
import Screen from '../../src/screens/MyCommunityScreen';
const navigation = { navigate: jest.fn() };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('../../src/components/ComposerKeyboardView', () => ({children}) => <>{children}</>);
const community = { id:'hood', name:'Maple Grove', role:'organizer', memberCount:4 };
beforeEach(()=>{
 jest.clearAllMocks();useFocusEffect.mockImplementation(cb=>React.useEffect(cb,[cb]));
 api.getCommunities.mockResolvedValue([community]);
 api.getCommunityChat.mockResolvedValue({messages:[],readSequence:'0',muted:false,role:'organizer'});
});
it('opens chat directly and keeps listing/dashboard clutter out',async()=>{
 const screen=render(<Screen navigation={navigation}/>);
 await screen.findByText('Say hello to your neighbors.');
 expect(api.getCommunityChat).toHaveBeenCalledWith('hood',{});
 expect(screen.queryByText('Sharing')).toBeNull();expect(screen.queryByText('Items')).toBeNull();
 fireEvent.press(screen.getByLabelText('View neighbors'));
 expect(navigation.navigate).toHaveBeenCalledWith('CommunityMembers',{id:'hood',role:'organizer'});
 fireEvent.press(screen.getByLabelText('Invite neighbors'));
 expect(navigation.navigate).toHaveBeenCalledWith('InviteMembers',{communityId:'hood'});
});
it('honors the Inbox channel instead of opening the first neighborhood',async()=>{
 api.getCommunities.mockResolvedValue([community,{id:'second',name:'Oak Lane',memberCount:8}]);
 const screen=render(<Screen route={{params:{communityId:'second'}}} navigation={navigation}/>);
 await screen.findByText('Say hello to your neighbors.');
 expect(api.getCommunityChat).toHaveBeenCalledWith('second',{});
 expect(api.getCommunityChat).not.toHaveBeenCalledWith('hood',{});
});
it('clears the previous channel on a neighborhood switch',async()=>{
 api.getCommunities.mockResolvedValue([community,{id:'second',name:'Oak Lane'}]);
 const screen=render(<Screen navigation={navigation}/>);await screen.findByText('Say hello to your neighbors.');
 fireEvent.press(screen.getByText('Oak Lane'));
 await waitFor(()=>expect(api.getCommunityChat).toHaveBeenCalledWith('second',{}));
});
it('offers retry for load failure and joining for an empty list',async()=>{
 api.getCommunities.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
 const screen=render(<Screen navigation={navigation}/>);fireEvent.press(await screen.findByText('Try again'));
 fireEvent.press(await screen.findByText('Find your neighborhood'));
 expect(navigation.navigate).toHaveBeenCalledWith('JoinCommunity');
});
it('keeps text and retry key after send failure and clears on success',async()=>{
 api.sendCommunityMessage.mockRejectedValueOnce(new Error('Offline')).mockResolvedValue({id:'sent'});
 const screen=render(<Screen navigation={navigation}/>);await screen.findByText('Say hello to your neighbors.');
 fireEvent.changeText(screen.getByLabelText('Message'),'Hello neighbors');
 fireEvent.press(screen.getByLabelText('Send message'));await screen.findByText('Offline');
 expect(screen.getByLabelText('Message').props.value).toBe('Hello neighbors');
 fireEvent.press(screen.getByLabelText('Send message'));
 await waitFor(()=>expect(screen.getByLabelText('Message').props.value).toBe(''));
 expect(api.sendCommunityMessage.mock.calls[0][1].clientRequestId).toBe(api.sendCommunityMessage.mock.calls[1][1].clientRequestId);
});
it('opens profiles and threaded replies from a message',async()=>{
 api.getCommunityChat.mockResolvedValue({messages:[{id:'m',sequence:'1',content:'Hello',sender:{id:'neighbor',name:'Sam'},createdAt:'2026-09-18',replyCount:1}],readSequence:'1',role:'member'});
 const screen=render(<Screen navigation={navigation}/>);await screen.findByText('Hello');
 fireEvent.press(screen.getByLabelText("View Sam's profile"));expect(navigation.navigate).toHaveBeenCalledWith('UserProfile',{id:'neighbor'});
 fireEvent.press(screen.getByLabelText('Reply to Sam'));
 await waitFor(()=>expect(api.getCommunityChat).toHaveBeenCalledWith('hood',{parentId:'m'}));
});
