import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../src/services/api';
import Screen from '../../src/screens/CommunityChatScreen';

const navigation = { navigate: jest.fn() };
const route = { params: { communityId: 'hood' } };
const mockUser = { id: 'me' };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../src/components/ComposerKeyboardView', () => ({children}) => <>{children}</>);
beforeEach(()=>{
 mockUser.id='me'; jest.clearAllMocks();
 useFocusEffect.mockImplementation(cb=>React.useEffect(cb,[cb]));
 api.getCommunityChat.mockResolvedValue({messages:[],readSequence:'0',muted:false,role:'member'});
});
it('opens the requested channel and acknowledges its loaded snapshot',async()=>{
 const screen=render(<Screen navigation={navigation} route={route}/>);
 await screen.findByText('Say hello to your neighbors.');
 expect(api.getCommunityChat).toHaveBeenCalledWith('hood',{});
 expect(api.markCommunityChatRead).toHaveBeenCalledWith('hood','0');
});
it('keeps text and retry key after send failure and clears on success',async()=>{
 api.sendCommunityMessage.mockRejectedValueOnce(new Error('Offline')).mockResolvedValue({id:'sent'});
 const screen=render(<Screen navigation={navigation} route={route}/>);await screen.findByText('Say hello to your neighbors.');
 fireEvent.changeText(screen.getByLabelText('Message'),'Hello neighbors');
 fireEvent.press(screen.getByLabelText('Send message'));await screen.findByText('Offline');
 expect(screen.getByLabelText('Message').props.value).toBe('Hello neighbors');
 fireEvent.press(screen.getByLabelText('Send message'));
 await waitFor(()=>expect(screen.getByLabelText('Message').props.value).toBe(''));
 expect(api.sendCommunityMessage.mock.calls[0][1].clientRequestId).toBe(api.sendCommunityMessage.mock.calls[1][1].clientRequestId);
});
it('opens profiles and threaded replies from a message',async()=>{
 api.getCommunityChat.mockResolvedValue({messages:[{id:'m',sequence:'1',content:'Hello',sender:{id:'neighbor',name:'Sam'},createdAt:'2026-09-18',replyCount:1}],readSequence:'1',role:'member'});
 const screen=render(<Screen navigation={navigation} route={route}/>);await screen.findByText('Hello');
 fireEvent.press(screen.getByLabelText("View Sam's profile"));expect(navigation.navigate).toHaveBeenCalledWith('UserProfile',{id:'neighbor'});
 fireEvent.press(screen.getByLabelText('Reply to Sam'));
 await waitFor(()=>expect(api.getCommunityChat).toHaveBeenCalledWith('hood',{parentId:'m'}));
});
it.each(['channel','account'])('clears the draft when the %s changes',async kind=>{
 const screen=render(<Screen navigation={navigation} route={route}/>);
 await screen.findByText('Say hello to your neighbors.');
 fireEvent.changeText(screen.getByLabelText('Message'),'Private draft');
 if(kind==='account')mockUser.id='other';
 screen.rerender(<Screen navigation={navigation} route={kind==='channel'?{params:{communityId:'second'}}:route}/>);
 await screen.findByText('Say hello to your neighbors.');
 expect(screen.getByLabelText('Message').props.value).toBe('');
});

it('reacts to both a neighborhood thread root and its reply through long press',async()=>{
 const root={id:'root',sequence:'1',content:'Bring a spare chair?',sender:{id:'neighbor',name:'Sam'},createdAt:'2026-09-18',replyCount:1};
 const child={id:'reply',sequence:'2',parentId:'root',content:'I have two',sender:{id:'neighbor',name:'Sam'},createdAt:'2026-09-18'};
 api.getCommunityChat.mockImplementation((_id,params)=>Promise.resolve({messages:params.parentId?[child]:[root],parent:params.parentId?root:null,readSequence:'2',role:'member'}));
 const screen=render(<Screen navigation={navigation} route={route}/>);
 fireEvent(await screen.findByText(root.content),'longPress');fireEvent.press(screen.getByLabelText('React: Love'));
 await waitFor(()=>expect(api.reactToCommunityMessage).toHaveBeenCalledWith('hood','root','❤️'));
 fireEvent.press(await screen.findByLabelText('Reply to Sam'));
 fireEvent(await screen.findByText(child.content),'longPress');fireEvent.press(screen.getByLabelText('React: Like'));
 await waitFor(()=>expect(api.reactToCommunityMessage).toHaveBeenCalledWith('hood','reply','👍'));
 fireEvent(screen.getByText(root.content),'longPress');expect(screen.getByLabelText('React: Love')).toBeTruthy();
});
