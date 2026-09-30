import React from 'react';
import {render,fireEvent,waitFor} from '@testing-library/react-native';
import api from '../../src/services/api';
import ProjectsScreen from '../../src/screens/ProjectsScreen';
import {projectItemState,projectProgress} from '../../src/utils/projectProgress';
jest.mock('react-native-gesture-handler',()=>({GestureHandlerRootView:require('react-native').View,Swipeable:require('react').forwardRef(({children,renderRightActions},ref)=><>{children}{renderRightActions?.()}</>)}));
jest.mock('../../src/context/AuthContext',()=>({useAuth:()=>({user:{id:'me'}})}));
jest.mock('../../src/context/ErrorContext',()=>({useError:()=>({showError:jest.fn()})}));
const navigation={navigate:jest.fn(),push:jest.fn(),replace:jest.fn(),goBack:jest.fn(),addListener:jest.fn(()=>jest.fn())};
const item={id:'slot',label:'Folding table',icon:'basket',owned:false,matches:[{id:'table',title:'Folding table nearby'}]};
beforeEach(()=>{jest.clearAllMocks();api.getProjectIdeas.mockResolvedValue([{id:'party',name:'Backyard party',description:'Tables and chairs',icon:'project-party',items:[item]}]);api.getProjects.mockResolvedValue([]);api.getProject.mockResolvedValue({id:'project',name:'Backyard party',items:[item]});});
it('opens an idea as a preview without saving it',async()=>{const s=render(<ProjectsScreen route={{}} navigation={navigation}/>);await s.findByText('Backyard party');fireEvent.press(s.getByLabelText('View Backyard party'));expect(navigation.push).toHaveBeenCalledWith('Projects',{templateId:'party'});expect(api.createProject).not.toHaveBeenCalled();});
it('opens a real listing with its project slot without sending a request',async()=>{const s=render(<ProjectsScreen route={{params:{id:'project'}}} navigation={navigation}/>);expect(await s.findByText('1 nearby')).toBeTruthy();fireEvent.press(await s.findByLabelText('Find Folding table'));fireEvent.press(await s.findByText('Folding table nearby'));await waitFor(()=>expect(navigation.navigate).toHaveBeenCalledWith('ListingDetail',{id:'table',projectItemId:'slot'}));expect(api.createTransaction).not.toHaveBeenCalled();});
it('marks an owned item and refreshes its server state',async()=>{const s=render(<ProjectsScreen route={{params:{id:'project'}}} navigation={navigation}/>);fireEvent.press(await s.findByLabelText('I have Folding table'));await waitFor(()=>expect(api.updateProjectItem).toHaveBeenCalledWith('project','slot',{owned:true}));});
it('does not count pending, cancelled or returned requests as ready',()=>{const rows=['pending','approved','picked_up','cancelled','returned'].map(transactionStatus=>({transactionId:'t',transactionStatus}));expect(projectProgress(rows)).toEqual({covered:2,waiting:1,total:5});expect(projectItemState(rows[4]).label).toBe('Returned');});
it('offers recovery for a failed load',async()=>{api.getProject.mockRejectedValueOnce(new Error('offline'));const s=render(<ProjectsScreen route={{params:{id:'project'}}} navigation={navigation}/>);fireEvent.press(await s.findByText('Try again'));expect(await s.findByText('Folding table')).toBeTruthy();});

it('counts every item on the user’s checklist',()=>{expect(projectProgress([{owned:true},{owned:false},{optional:true,owned:false}])).toEqual({covered:1,waiting:0,total:3});});
it('saves a preview only after explicit saving and keeps its edits',async()=>{api.createProject.mockResolvedValue({id:'new'});const s=render(<ProjectsScreen route={{params:{templateId:'party'}}} navigation={navigation}/>);fireEvent.press(await s.findByLabelText('I have Folding table'));expect(api.updateProjectItem).not.toHaveBeenCalled();fireEvent.press(s.getByText('Save plan'));await waitFor(()=>expect(api.createProject).toHaveBeenCalledWith({templateId:'party',items:[{label:'Folding table',owned:true}]}));expect(navigation.replace).toHaveBeenCalledWith('Projects',{id:'new'});});
it('removes the last checklist item and shows an empty editable list',async()=>{const s=render(<ProjectsScreen route={{params:{id:'project'}}} navigation={navigation}/>);fireEvent.press(await s.findByLabelText('Edit checklist'));api.getProject.mockResolvedValue({id:'project',name:'Backyard party',items:[]});fireEvent.press(s.getByLabelText('Remove Folding table'));await waitFor(()=>expect(api.deleteProjectItem).toHaveBeenCalledWith('project','slot'));expect(await s.findByText('Add what you need for this plan.')).toBeTruthy();});
it('prefills Ask with the selected item and keeps its draft separate',async()=>{api.getProject.mockResolvedValue({id:'project',name:'Backyard party',items:[{...item,matches:[]}]});const s=render(<ProjectsScreen route={{params:{id:'project'}}} navigation={navigation}/>);fireEvent.press(await s.findByText('Ask'));expect(navigation.navigate).toHaveBeenCalledWith('CreateRequest',{initialTitle:'Folding table',projectItemId:'slot'});});
it('lets a user create a named blank plan',async()=>{api.createProject.mockResolvedValue({id:'own'});const s=render(<ProjectsScreen route={{params:{custom:true}}} navigation={navigation}/>);fireEvent.changeText(await s.findByLabelText('Plan name'),'Build a garden bed');fireEvent.press(s.getByText('Save plan'));await waitFor(()=>expect(api.createProject).toHaveBeenCalledWith({templateId:'custom',name:'Build a garden bed',items:[]}));});

it('offers swipe removal for saved plans without creating or deleting anything on open',async()=>{
 api.getProjects.mockResolvedValue([{id:'saved',templateId:'party',name:'My party'}]);
 const s=render(<ProjectsScreen route={{}} navigation={navigation}/>);
 fireEvent.press(await s.findByLabelText('Swipe remove My party'));
 expect(api.deleteProject).not.toHaveBeenCalled();
 api.getProjects.mockResolvedValue([]);
 fireEvent.press(await s.findByText('Remove plan'));
 await waitFor(()=>expect(api.deleteProject).toHaveBeenCalledWith('saved'));
});
it('keeps an active exchange intact when its checklist row is removed',async()=>{
 api.getProject.mockResolvedValue({id:'project',name:'Party',items:[{...item,transactionId:'exchange',transactionStatus:'pending'}]});
 const s=render(<ProjectsScreen route={{params:{id:'project'}}} navigation={navigation}/>);
 fireEvent.press(await s.findByLabelText('Swipe remove Folding table'));
 expect(api.deleteProjectItem).not.toHaveBeenCalled();
 expect(await s.findByText(/Its request or exchange stays active/)).toBeTruthy();
 fireEvent.press(s.getByText('Remove from checklist'));
 await waitFor(()=>expect(api.deleteProjectItem).toHaveBeenCalledWith('project','slot'));
});
