import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../src/services/api';
import Screen from '../../src/screens/CommunityChatScreen';
import MessageBubble from '../../src/components/MessageBubble';
import { FlatList } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { communityPhotoContent } from '../../src/utils/communityChatPhoto';

const navigation = { navigate: jest.fn() };
const route = { params: { communityId: 'hood' } };
const mockUser = { id: 'me' };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../src/components/ComposerKeyboardView', () => ({children}) => <>{children}</>);
beforeEach(()=>{
 mockUser.id='me'; jest.clearAllMocks();
 api.sendCommunityMessage.mockReset().mockResolvedValue({id:'sent'});
 api.uploadImage.mockReset();
 useFocusEffect.mockImplementation(cb=>React.useEffect(cb,[cb]));
 api.getCommunityChat.mockResolvedValue({messages:[],readSequence:'0',muted:false,role:'member'});
 api.getCommunity.mockResolvedValue({id:'hood',name:'Men of Mendon St',memberCount:12});
});
it('opens the requested channel and acknowledges its loaded snapshot',async()=>{
 const screen=render(<Screen navigation={navigation} route={route}/>);
 await screen.findByText('Say hi to your neighbors 👋');
 expect(api.getCommunityChat).toHaveBeenCalledWith('hood',{});
 expect(api.markCommunityChatRead).toHaveBeenCalledWith('hood','0');
});
it('keeps text and retry key after send failure and clears on success',async()=>{
 api.sendCommunityMessage.mockRejectedValueOnce(new Error('Offline')).mockResolvedValue({id:'sent'});
 const screen=render(<Screen navigation={navigation} route={route}/>);await screen.findByText('Say hi to your neighbors 👋');
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
it('shows chronological left/right bubbles and keeps earlier pages above the conversation',async()=>{
 const older={id:'older',sequence:'1',content:'Earlier hello',sender:{id:'neighbor',name:'Sam'},createdAt:'2026-10-02T08:00:00Z'};
 const own={id:'own',sequence:'2',content:'I can help',sender:{id:'me',name:'Chris Bailey'},createdAt:'2026-10-02T10:00:00Z'};
 const incoming={id:'incoming',sequence:'3',content:'Thank you',sender:{id:'neighbor',name:'Sam'},createdAt:'2026-10-02T10:01:00Z'};
 api.getCommunityChat.mockImplementation((_id,params)=>Promise.resolve({messages:params.before?[older]:[incoming,own],nextBefore:params.before?null:'2',readSequence:'3',role:'member'}));
 const screen=render(<Screen navigation={navigation} route={route}/>);await screen.findByText('Thank you');
 const bubbles=()=>screen.UNSAFE_getAllByType(MessageBubble).map(bubble=>[bubble.props.testID,bubble.props.own]);
 expect(bubbles()).toEqual([['CommunityChat.message.own',true],['CommunityChat.message.incoming',false]]);
 expect(screen.UNSAFE_getByType(FlatList).props.inverted).toBeFalsy();
 fireEvent.press(screen.getByText('Earlier messages'));
 await screen.findByText('Earlier hello');
 expect(api.getCommunityChat).toHaveBeenCalledWith('hood',{before:'2'});
 expect(bubbles()).toEqual([['CommunityChat.message.older',false],['CommunityChat.message.own',true],['CommunityChat.message.incoming',false]]);
});
it.each(['channel','account'])('clears the draft when the %s changes',async kind=>{
 const screen=render(<Screen navigation={navigation} route={route}/>);
 await screen.findByText('Say hi to your neighbors 👋');
 fireEvent.changeText(screen.getByLabelText('Message'),'Private draft');
 if(kind==='account')mockUser.id='other';
 screen.rerender(<Screen navigation={navigation} route={kind==='channel'?{params:{communityId:'second'}}:route}/>);
 await screen.findByText('Say hi to your neighbors 👋');
 expect(screen.getByLabelText('Message').props.value).toBe('');
});

it('reacts to both a neighborhood thread root and its reply through long press',async()=>{
 const root={id:'root',sequence:'1',content:'Bring a spare chair?',sender:{id:'neighbor',name:'Sam'},createdAt:'2026-09-18',replyCount:1};
 const child={id:'reply',sequence:'2',parentId:'root',content:'I have two',sender:{id:'neighbor',name:'Sam'},createdAt:'2026-09-18'};
 api.getCommunityChat.mockImplementation((_id,params)=>Promise.resolve({messages:params.parentId?[child]:[root],parent:params.parentId?root:null,readSequence:'2',role:'member'}));
 const screen=render(<Screen navigation={navigation} route={route}/>);
 fireEvent(await screen.findByText(root.content),'longPress');fireEvent.press(screen.getByLabelText('Add reaction'));fireEvent.press(await screen.findByLabelText('React: Love'));
 await waitFor(()=>expect(api.reactToCommunityMessage).toHaveBeenCalledWith('hood','root','❤️'));
 fireEvent.press(await screen.findByLabelText('Reply to Sam'));
 fireEvent(await screen.findByText(child.content),'longPress');fireEvent.press(screen.getByLabelText('Add reaction'));fireEvent.press(await screen.findByLabelText('React: Like'));
 await waitFor(()=>expect(api.reactToCommunityMessage).toHaveBeenCalledWith('hood','reply','👍'));
 fireEvent(screen.getByText(root.content),'longPress');fireEvent.press(screen.getByLabelText('Add reaction'));expect(await screen.findByLabelText('React: Love')).toBeTruthy();
});

it('uses one group header and keeps actions behind long press, even for a message without replies',async()=>{
 const message={id:'m',sequence:'1',content:'Hello everyone',sender:{id:'neighbor',name:'Sam'},createdAt:new Date().toISOString(),replyCount:0};
 api.getCommunityChat.mockResolvedValue({messages:[message],readSequence:'1',role:'member'});
 const screen=render(<Screen navigation={navigation} route={route}/>);await screen.findByText(message.content);
 expect(await screen.findByText('12 neighbors')).toBeTruthy();
 expect(screen.queryByText('Chat')).toBeNull();expect(screen.queryByText('Reply')).toBeNull();
 expect(screen.queryByLabelText('Add reaction')).toBeNull();expect(screen.queryByLabelText('Message options')).toBeNull();
 fireEvent(screen.getByText(message.content),'longPress');
 expect(screen.getByLabelText('Add reaction')).toBeTruthy();expect(screen.getByLabelText('Copy text')).toBeTruthy();
 fireEvent.press(screen.getByLabelText('Reply in thread'));
 await waitFor(()=>expect(api.getCommunityChat).toHaveBeenCalledWith('hood',{parentId:'m'}));
});

it('groups consecutive incoming messages across pauses and offers starters without posting them',async()=>{
 const messages=[
  {id:'a',sequence:'1',content:'Hello',sender:{id:'neighbor',name:'Sam'},createdAt:'2026-09-18T08:00:00Z'},
  {id:'b',sequence:'2',content:'Anyone around?',sender:{id:'neighbor',name:'Sam'},createdAt:'2026-09-18T08:30:00Z'},
 ];
 api.getCommunityChat.mockResolvedValue({messages:[...messages].reverse(),readSequence:'2',role:'member'});
 const screen=render(<Screen navigation={navigation} route={route}/>);await screen.findByText('Anyone around?');
 expect(screen.UNSAFE_getAllByType(MessageBubble).map(b=>b.props.startsGroup)).toEqual([true,false]);
 expect(screen.getAllByLabelText("View Sam's profile")).toHaveLength(1);
 fireEvent.press(screen.getByLabelText('Use starter: Hi, neighbors! 👋'));
 expect(screen.getByLabelText('Message').props.value).toBe('Hi, neighbors! 👋');
 expect(api.sendCommunityMessage).not.toHaveBeenCalled();
});

it('uploads a photo once and keeps its caption and request ID through a send retry',async()=>{
 const url='https://borrowhood-uploads.s3.us-east-1.amazonaws.com/messages/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.jpg';
 ImagePicker.launchImageLibraryAsync.mockResolvedValue({canceled:false,assets:[{uri:'file://chat.jpg'}]});
 api.uploadImage.mockResolvedValue(url);api.sendCommunityMessage.mockRejectedValueOnce(new Error('Offline')).mockResolvedValue({id:'photo'});
 const screen=render(<Screen navigation={navigation} route={route}/>);await screen.findByText('Say hi to your neighbors 👋');
 fireEvent.press(screen.getByLabelText('Add attachment'));fireEvent.press(screen.getByLabelText('Choose a photo'));
 await screen.findByText('Photo selected');fireEvent.changeText(screen.getByLabelText('Message'),'The spare ladder');
 fireEvent.press(screen.getByLabelText('Send message'));await screen.findByText('Offline');
 expect(screen.getByLabelText('Message').props.value).toBe('The spare ladder');expect(screen.getByText('Photo selected')).toBeTruthy();
 await waitFor(()=>expect(screen.getByLabelText('Send message').props.accessibilityState.disabled).toBe(false));
 fireEvent.press(screen.getByLabelText('Send message'));
 await waitFor(()=>expect(api.sendCommunityMessage).toHaveBeenCalledTimes(2));
 await waitFor(()=>expect(screen.queryByText('Photo selected')).toBeNull());
 expect(api.uploadImage).toHaveBeenCalledTimes(1);expect(api.uploadImage).toHaveBeenCalledWith('file://chat.jpg','messages');
 const sends=api.sendCommunityMessage.mock.calls;
 expect(sends[0][1]).toEqual(sends[1][1]);expect(sends[0][1].content).toBe(communityPhotoContent(url,'The spare ladder'));
});

it('does not send a photo after the account or channel has unmounted',async()=>{
 let uploaded;api.uploadImage.mockImplementation(()=>new Promise(resolve=>{uploaded=resolve;}));
 ImagePicker.launchImageLibraryAsync.mockResolvedValue({canceled:false,assets:[{uri:'file://chat.jpg'}]});
 const screen=render(<Screen navigation={navigation} route={route}/>);await screen.findByText('Say hi to your neighbors 👋');
 fireEvent.press(screen.getByLabelText('Add attachment'));fireEvent.press(screen.getByLabelText('Choose a photo'));
 await screen.findByText('Photo selected');fireEvent.press(screen.getByLabelText('Send message'));
 await waitFor(()=>expect(api.uploadImage).toHaveBeenCalled());
 screen.rerender(<Screen navigation={navigation} route={{params:{communityId:'second'}}}/>);
 await screen.findByText('Say hi to your neighbors 👋');
 uploaded('https://example.com/photo.jpg');await waitFor(()=>expect(screen.queryByText('Photo selected')).toBeNull());
 expect(api.sendCommunityMessage).not.toHaveBeenCalled();
});
