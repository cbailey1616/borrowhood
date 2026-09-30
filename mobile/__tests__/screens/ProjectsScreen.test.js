import React from 'react';
import {BottomTabBarHeightContext} from '@react-navigation/bottom-tabs';
import {render,fireEvent,waitFor,act} from '@testing-library/react-native';
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
it('opens a real listing with its project slot without sending a request',async()=>{const s=render(<ProjectsScreen route={{params:{id:'project'}}} navigation={navigation}/>);expect(await s.findByText('1 nearby')).toBeTruthy();fireEvent.press(await s.findByLabelText('Find Folding table'));fireEvent.press(await s.findByText('Folding table nearby'));await waitFor(()=>expect(navigation.navigate).toHaveBeenCalledWith('ListingDetail',{id:'table',projectId:'project',projectItemId:'slot'}));expect(api.createTransaction).not.toHaveBeenCalled();});
it('marks an owned item and refreshes its server state',async()=>{const s=render(<ProjectsScreen route={{params:{id:'project'}}} navigation={navigation}/>);fireEvent.press(await s.findByLabelText('I have Folding table'));await waitFor(()=>expect(api.updateProjectItem).toHaveBeenCalledWith('project','slot',{owned:true}));});
it('does not count pending, cancelled or returned requests as ready',()=>{const rows=['pending','approved','picked_up','cancelled','returned'].map(transactionStatus=>({transactionId:'t',transactionStatus}));expect(projectProgress(rows)).toEqual({covered:2,waiting:1,total:5});expect(projectItemState(rows[4]).label).toBe('Returned');});
it('shows an approved reserved leaf blower as ready for pickup instead of unavailable',async()=>{
 api.getProject.mockResolvedValue({id:'project',name:'Garden or yard overhaul',items:[{...item,label:'Leaf blower',matches:[],nearbyCount:0,transactionId:'blower-borrow',transactionStatus:'approved'}]});
 const s=render(<ProjectsScreen route={{params:{id:'project'}}} navigation={navigation}/>);
 expect(await s.findByText('Waiting for pickup')).toBeTruthy();
 expect(s.getByText('1 ready · 0 to find')).toBeTruthy();
 expect(s.queryByText('No nearby items yet')).toBeNull();
 expect(s.queryByText('Ask neighbors')).toBeNull();
 fireEvent.press(s.getByLabelText('View exchange for Leaf blower'));
 expect(navigation.navigate).toHaveBeenCalledWith('TransactionDetail',{id:'blower-borrow'});
});
it('offers recovery for a failed load',async()=>{api.getProject.mockRejectedValueOnce(new Error('offline'));const s=render(<ProjectsScreen route={{params:{id:'project'}}} navigation={navigation}/>);fireEvent.press(await s.findByText('Try again'));expect(await s.findByText('Folding table')).toBeTruthy();});

it('counts every item on the user’s checklist',()=>{expect(projectProgress([{owned:true},{owned:false},{optional:true,owned:false}])).toEqual({covered:1,waiting:0,total:3});});
it('saves a preview only after explicit saving and keeps its edits',async()=>{api.createProject.mockResolvedValue({id:'new'});const s=render(<ProjectsScreen route={{params:{templateId:'party'}}} navigation={navigation}/>);fireEvent.press(await s.findByLabelText('I have Folding table'));expect(api.updateProjectItem).not.toHaveBeenCalled();fireEvent.press(s.getByText('Save plan'));await waitFor(()=>expect(api.createProject).toHaveBeenCalledWith({templateId:'party',items:[{label:'Folding table',owned:true}]}));expect(navigation.replace).toHaveBeenCalledWith('Projects',{id:'new'});});
it('removes the last checklist item and shows an empty editable list',async()=>{const s=render(<ProjectsScreen route={{params:{id:'project'}}} navigation={navigation}/>);fireEvent.press(await s.findByLabelText('Edit checklist'));api.getProject.mockResolvedValue({id:'project',name:'Backyard party',items:[]});fireEvent.press(s.getByLabelText('Remove Folding table'));await waitFor(()=>expect(api.deleteProjectItem).toHaveBeenCalledWith('project','slot'));expect(await s.findByText('Add what you need for this plan.')).toBeTruthy();});
it('prefills Ask with the selected item and keeps its draft separate',async()=>{api.getProject.mockResolvedValue({id:'project',name:'Backyard party',items:[{...item,matches:[]}]});const s=render(<ProjectsScreen route={{params:{id:'project'}}} navigation={navigation}/>);fireEvent.press(await s.findByText('Ask neighbors'));expect(navigation.navigate).toHaveBeenCalledWith('CreateRequest',{initialTitle:'Folding table',projectItemId:'slot'});});
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
it('keeps the end of Ideas above the measured bottom ribbon',async()=>{
 const s=render(<BottomTabBarHeightContext.Provider value={110}><ProjectsScreen route={{}} navigation={navigation} embedded/></BottomTabBarHeightContext.Provider>);
 await s.findByText('Make a plan. Borrow from neighbors.');
 expect(s.getByTestId('Projects.scroll').props.contentContainerStyle.paddingBottom).toBe(134);
});
it('removes an item through its tap menu without swiping',async()=>{
 const s=render(<ProjectsScreen route={{params:{id:'project'}}} navigation={navigation}/>);
 fireEvent.press(await s.findByLabelText('Edit or remove Folding table'));
 fireEvent.press(await s.findByText('Remove item'));
 await waitFor(()=>expect(api.deleteProjectItem).toHaveBeenCalledWith('project','slot'));
});
it('edits a saved item through its tap menu',async()=>{
 const s=render(<ProjectsScreen route={{params:{id:'project'}}} navigation={navigation}/>);
 fireEvent.press(await s.findByLabelText('Edit or remove Folding table'));
 fireEvent.press(await s.findByText('Edit item'));
 fireEvent.changeText(await s.findByLabelText('Checklist item name'),'Picnic blanket');
 fireEvent.press(s.getByText('Save item'));
 await waitFor(()=>expect(api.updateProjectItem).toHaveBeenCalledWith('project','slot',{label:'Picnic blanket'}));
});
it('keeps preview item edits local until saving the plan',async()=>{
 const s=render(<ProjectsScreen route={{params:{templateId:'party'}}} navigation={navigation}/>);
 fireEvent.press(await s.findByLabelText('Options for Folding table'));
 fireEvent.press(await s.findByText('Edit item'));
 fireEvent.changeText(await s.findByLabelText('Checklist item name'),'Picnic blanket');
 fireEvent.press(s.getByText('Save item'));
 expect(await s.findByText('Picnic blanket')).toBeTruthy();
 expect(api.updateProjectItem).not.toHaveBeenCalled();
});
it('keeps linked exchanges intact and prevents relabeling their checklist slots',async()=>{
 api.getProject.mockResolvedValue({id:'project',name:'Party',items:[{...item,transactionId:'exchange',transactionStatus:'pending'}]});
 const s=render(<ProjectsScreen route={{params:{id:'project'}}} navigation={navigation}/>);
 fireEvent.press(await s.findByLabelText('Edit or remove Folding table'));
 expect(s.queryByText('Edit item')).toBeNull();
 expect(s.getByText(/Removing this item keeps its request or exchange active/)).toBeTruthy();
 fireEvent.press(s.getByText('Remove item'));
 await waitFor(()=>expect(api.deleteProjectItem).toHaveBeenCalledWith('project','slot'));
 expect(api.updateProjectItem).not.toHaveBeenCalled();
});
it('carries an unsaved checklist into listing browsing without saving it',async()=>{
 const s=render(<ProjectsScreen route={{params:{templateId:'party'}}} navigation={navigation}/>);
 fireEvent.press(await s.findByLabelText('Find Folding table'));
 fireEvent.press(await s.findByText('Folding table nearby'));
 await waitFor(()=>expect(navigation.navigate).toHaveBeenCalledWith('ListingDetail',{id:'table',projectDraft:{templateId:'party',label:'Folding table',items:[{label:'Folding table',owned:false}]}}));
 expect(api.createProject).not.toHaveBeenCalled();
});
it('keeps unsaved checklist edits when returning from browsing',async()=>{
 const s=render(<ProjectsScreen route={{params:{templateId:'party'}}} navigation={navigation}/>);
 fireEvent.press(await s.findByLabelText('I have Folding table'));
 await act(async()=>{await navigation.addListener.mock.calls.find(([name])=>name==='focus')[1]();});
 expect(await s.findByText('Already have it')).toBeTruthy();
 expect(api.createProject).not.toHaveBeenCalled();
});
it('refreshes a preview into its saved plan after requesting an item',async()=>{
 const s=render(<ProjectsScreen route={{params:{templateId:'party'}}} navigation={navigation}/>);
 await s.findByText('Save plan');
 api.getProjects.mockResolvedValue([{id:'saved',templateId:'party',name:'Backyard party'}]);
 api.getProject.mockResolvedValue({id:'saved',templateId:'party',name:'Backyard party',items:[{...item,matches:[],nearbyCount:0,transactionId:'exchange',transactionStatus:'approved'}]});
 await act(async()=>{await navigation.addListener.mock.calls.find(([name])=>name==='focus')[1]();});
 expect(await s.findByText('Waiting for pickup')).toBeTruthy();
 expect(s.queryByText('Save plan')).toBeNull();
 expect(s.getByText('1 ready · 0 to find')).toBeTruthy();
});
it('links an existing approved borrow and shows it as ready even with no nearby inventory',async()=>{
 api.getTransactions.mockResolvedValue([{id:'exchange',isBorrower:true,status:'approved',listing:{title:'Folding table'}}]);
 const s=render(<ProjectsScreen route={{params:{id:'project'}}} navigation={navigation}/>);
 fireEvent.press(await s.findByLabelText('Edit or remove Folding table'));
 fireEvent.press(await s.findByText('Use an existing exchange'));
 api.getProject.mockResolvedValue({id:'project',name:'Party',items:[{...item,matches:[],nearbyCount:0,transactionId:'exchange',transactionStatus:'approved'}]});
 fireEvent.press(await s.findByText('Folding table · Waiting for pickup'));
 await waitFor(()=>expect(api.linkProjectExchange).toHaveBeenCalledWith('project','slot','exchange'));
 expect(await s.findByText('Waiting for pickup')).toBeTruthy();
 expect(s.queryByText('No nearby items yet')).toBeNull();
});
it('promotes an unsaved custom plan after linking without a stale preview overwriting it',async()=>{
 api.getTransactions.mockResolvedValue([{id:'exchange',isBorrower:true,status:'approved',listing:{title:'Folding table'}}]);
 api.createProject.mockResolvedValue({id:'saved'});
 let linked=false;
 api.getProject.mockImplementation(async()=>({id:'saved',templateId:'custom',name:'Dinner party',items:[{...item,matches:[],...(linked?{transactionId:'exchange',transactionStatus:'approved'}:{})}]}));
 api.linkProjectExchange.mockImplementation(async()=>{linked=true;});
 const s=render(<ProjectsScreen route={{params:{custom:true}}} navigation={navigation}/>);
 fireEvent.changeText(await s.findByLabelText('Plan name'),'Dinner party');
 fireEvent.changeText(await s.findByLabelText('Add a checklist item'),'Folding table');
 fireEvent.press(s.getByText('Add item'));
 fireEvent.press(await s.findByLabelText('Edit or remove Folding table'));
 fireEvent.press(await s.findByText('Use an existing exchange'));
 fireEvent.press(await s.findByText('Folding table · Waiting for pickup'));
 expect(await s.findByText('Waiting for pickup')).toBeTruthy();
 await act(async()=>{});
 expect(s.getByText('Dinner party')).toBeTruthy();
 expect(s.getByText('1 ready · 0 to find')).toBeTruthy();
 expect(s.queryByText('Save plan')).toBeNull();
 expect(api.linkProjectExchange).toHaveBeenCalledWith('saved','slot','exchange');
});
it('starts a custom plan with a visible item input and shows borrowing controls after saving',async()=>{
 const s=render(<ProjectsScreen route={{params:{custom:true}}} navigation={navigation}/>);
 expect(await s.findByText('New plan')).toBeTruthy();
 expect(s.getByLabelText('Add a checklist item')).toBeTruthy();
 expect(s.queryByLabelText('Edit checklist')).toBeNull();
 expect(s.getByLabelText('Save plan').props.accessibilityState.disabled).toBe(true);
 fireEvent.changeText(s.getByLabelText('Plan name'),'Cookout');
 fireEvent.changeText(s.getByLabelText('Add a checklist item'),'Cooler');
 fireEvent.press(s.getByText('Add item'));
 expect(await s.findByText('Cooler')).toBeTruthy();
 expect(s.queryByText('Ask neighbors')).toBeNull();
 expect(s.queryByText('No nearby items yet')).toBeNull();
 expect(s.queryByRole('progressbar')).toBeNull();
 api.getProject.mockResolvedValue({id:'saved',name:'Cookout',items:[{...item,label:'Cooler',matches:[]}]});
 s.rerender(<ProjectsScreen route={{params:{id:'saved'}}} navigation={navigation}/>);
 expect(await s.findByText('Ask neighbors')).toBeTruthy();
 expect(s.getByText('0 ready · 1 to find')).toBeTruthy();
});
it('saves the item being typed along with the rest of a custom checklist',async()=>{
 api.createProject.mockResolvedValue({id:'saved'});
 const s=render(<ProjectsScreen route={{params:{custom:true}}} navigation={navigation}/>);
 fireEvent.changeText(await s.findByLabelText('Plan name'),'Cookout');
 fireEvent.changeText(s.getByLabelText('Add a checklist item'),'Cooler');
 fireEvent.press(s.getByText('Save plan'));
 await waitFor(()=>expect(api.createProject).toHaveBeenCalledWith({templateId:'custom',name:'Cookout',items:[{label:'Cooler',owned:false}]}));
 expect(navigation.replace).toHaveBeenCalledWith('Projects',{id:'saved'});
});
