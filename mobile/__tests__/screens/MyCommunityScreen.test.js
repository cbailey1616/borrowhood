import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../src/services/api';
import Screen from '../../src/screens/MyCommunityScreen';
const navigation = { navigate: jest.fn(), setOptions: jest.fn() };
const mockUser = { id: 'me' };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../src/components/ComposerKeyboardView', () => ({children}) => <>{children}</>);
const community = { id:'hood', name:'Maple Grove', role:'organizer', memberCount:4, communityType:'town' };
beforeEach(()=>{
 mockUser.id='me';
 jest.clearAllMocks();useFocusEffect.mockImplementation(cb=>React.useEffect(cb,[cb]));
 api.getCommunities.mockResolvedValue([community]);
 api.getCommunityChatSummary.mockResolvedValue({lastMessage:null,unreadCount:0});
 api.getCommunityChat.mockResolvedValue({messages:[],readSequence:'0',muted:false,role:'organizer'});
});
it('shows shortcuts without a composer and opens the same chat channel as Inbox',async()=>{
 const screen=render(<Screen navigation={navigation}/>);
 await screen.findByText('Say hello to your neighbors.');
 expect(api.getCommunityChatSummary).toHaveBeenCalledWith('hood');
 expect(api.getCommunityChat).not.toHaveBeenCalled();
 expect(api.markCommunityChatRead).not.toHaveBeenCalled();
 expect(screen.queryByLabelText('Message')).toBeNull();
 expect(screen.queryByLabelText('Chat options')).toBeNull();
 fireEvent.press(screen.getByLabelText('Neighborhood chat'));
 expect(navigation.navigate).toHaveBeenCalledWith('CommunityChat',{communityId:'hood',communityName:'Maple Grove'});
 expect(screen.queryByText('Sharing')).toBeNull();expect(screen.queryByText('Items')).toBeNull();
 fireEvent.press(screen.getByLabelText('View neighbors'));
 expect(navigation.navigate).toHaveBeenCalledWith('CommunityMembers',{id:'hood',role:'organizer'});
 fireEvent.press(screen.getByLabelText('Invite neighbors'));
 expect(navigation.navigate).toHaveBeenCalledWith('InviteMembers',{communityId:'hood'});
});
it('honors a requested neighborhood instead of opening the first one',async()=>{
 api.getCommunities.mockResolvedValue([community,{id:'second',name:'Oak Lane',memberCount:8}]);
 const screen=render(<Screen route={{params:{communityId:'second'}}} navigation={navigation}/>);
 await screen.findByText('Say hello to your neighbors.');
 expect(api.getCommunityChatSummary).toHaveBeenCalledWith('second');
 expect(api.getCommunityChatSummary).not.toHaveBeenCalledWith('hood');
});
it('clears the previous channel on a neighborhood switch',async()=>{
 api.getCommunities.mockResolvedValue([community,{id:'second',name:'Oak Lane'}]);
 const screen=render(<Screen navigation={navigation}/>);await screen.findByText('Say hello to your neighbors.');
 fireEvent.press(screen.getByText('Oak Lane'));
 await waitFor(()=>expect(api.getCommunityChatSummary).toHaveBeenCalledWith('second'));
});
it('offers retry for load failure and joining for an empty list',async()=>{
 api.getCommunities.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
 const screen=render(<Screen navigation={navigation}/>);fireEvent.press(await screen.findByText('Try again'));
 fireEvent.press(await screen.findByText('Find your neighborhood'));
 expect(navigation.navigate).toHaveBeenCalledWith('JoinCommunity');
});
it('preserves the joined neighborhood when refreshing membership fails',async()=>{
 const screen=render(<Screen navigation={navigation}/>);
 await screen.findByText('Maple Grove');
 api.getCommunities.mockRejectedValueOnce(new Error('Offline'));
 screen.rerender(<Screen route={{params:{communityId:'hood'}}} navigation={navigation}/>);
 await screen.findByLabelText('Retry loading neighborhoods');
 expect(screen.getByText('Maple Grove')).toBeTruthy();
 expect(screen.queryByText('Meet your neighbors')).toBeNull();
});
it('does not treat a malformed membership response as an empty membership',async()=>{
 api.getCommunities.mockResolvedValue({});
 const screen=render(<Screen navigation={navigation}/>);
 await screen.findByText('Couldn’t load your neighborhood');
 expect(screen.queryByText('Find your neighborhood')).toBeNull();
});
it('clears the previous account’s neighborhood while a different account loads',async()=>{
 const screen=render(<Screen navigation={navigation}/>);
 await screen.findByText('Maple Grove');
 let finish;
 api.getCommunities.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 mockUser.id='another';
 screen.rerender(<Screen navigation={navigation}/>);
 expect(screen.queryByText('Maple Grove')).toBeNull();
 await act(async()=>finish([]));
 await screen.findByText('Meet your neighbors');
});
it('shows the unread preview without acknowledging those messages',async()=>{
 api.getCommunityChatSummary.mockResolvedValue({lastMessage:'Anyone need garden pots?',unreadCount:3});
 const screen=render(<Screen navigation={navigation}/>);
 await screen.findByText('Anyone need garden pots?');
 expect(screen.getByLabelText('Neighborhood chat').props.accessibilityHint).toBe('3 unread messages');
 expect(api.markCommunityChatRead).not.toHaveBeenCalled();
});
it('opens the items feed for the selected neighborhood',async()=>{
 const screen=render(<Screen navigation={navigation}/>);
 fireEvent.press(await screen.findByLabelText('Neighborhood items'));
 expect(navigation.navigate).toHaveBeenCalledWith('Main',{screen:'Feed',params:{neighborhoodItems:{id:'hood',name:'Maple Grove',requestId:expect.any(String)}}});
});
it.each(['organizer','member'])('shows one Manage entry only for an organizer (%s)',async role=>{
 api.getCommunities.mockResolvedValue([{...community,role}]);
 const screen=render(<Screen navigation={navigation}/>);
 await screen.findByText('Maple Grove');
 const Header=navigation.setOptions.mock.calls.at(-1)[0].header;
 const header=render(<Header navigation={navigation}/>);
 if(role==='organizer'){
  fireEvent.press(header.getByLabelText('Manage neighborhood'));
  expect(navigation.navigate).toHaveBeenCalledWith('CommunitySettings',{id:'hood'});
 }else expect(header.queryByText('Manage')).toBeNull();
});
it('shows an announcement only when one has been posted',async()=>{
 const screen=render(<Screen navigation={navigation}/>);
 await screen.findByText('Maple Grove');
 expect(screen.queryByText('Announcement')).toBeNull();
 api.getCommunities.mockResolvedValue([{...community,announcement:'Cleanup on Saturday'}]);
 screen.rerender(<Screen navigation={navigation} route={{params:{communityId:'hood'}}}/>);
 await screen.findByText('Cleanup on Saturday');
});
it('ignores a late preview from a different neighborhood',async()=>{
 api.getCommunities.mockResolvedValue([community,{id:'second',name:'Oak Lane'}]);
 let finish;
 api.getCommunityChatSummary.mockImplementation(id=>id==='hood'?new Promise(resolve=>{finish=resolve;}):Promise.resolve({lastMessage:'Oak update',unreadCount:1}));
 const screen=render(<Screen navigation={navigation}/>);
 await screen.findAllByText('Maple Grove');
 fireEvent.press(screen.getByText('Oak Lane'));
 await screen.findByText('Oak update');
 await act(async()=>finish({lastMessage:'Old neighborhood message',unreadCount:4}));
 expect(screen.queryByText('Old neighborhood message')).toBeNull();
});
