import React from 'react';
import {render,fireEvent,waitFor} from '@testing-library/react-native';
import api from '../../src/services/api';
import ProjectsScreen from '../../src/screens/ProjectsScreen';
import {projectItemState,projectProgress} from '../../src/utils/projectProgress';
jest.mock('../../src/context/AuthContext',()=>({useAuth:()=>({user:{id:'me'}})}));
jest.mock('../../src/context/ErrorContext',()=>({useError:()=>({showError:jest.fn()})}));
const navigation={navigate:jest.fn(),push:jest.fn(),goBack:jest.fn(),addListener:jest.fn(()=>jest.fn())};
const item={id:'slot',label:'Folding table',icon:'basket',owned:false,matches:[{id:'table',title:'Folding table nearby'}]};
beforeEach(()=>{jest.clearAllMocks();api.getProjectIdeas.mockResolvedValue([{id:'party',name:'Backyard party',description:'Tables and chairs',icon:'project-party',items:[item]}]);api.getProjects.mockResolvedValue([]);api.getProject.mockResolvedValue({id:'project',name:'Backyard party',items:[item]});});
it('starts a saved checklist only on explicit selection',async()=>{api.createProject.mockResolvedValue({id:'new'});const s=render(<ProjectsScreen route={{}} navigation={navigation}/>);await s.findByText('Backyard party');expect(api.createProject).not.toHaveBeenCalled();fireEvent.press(s.getByLabelText('Start Backyard party'));await waitFor(()=>expect(navigation.push).toHaveBeenCalledWith('Projects',{id:'new'}));});
it('opens a real listing with its project slot without sending a request',async()=>{const s=render(<ProjectsScreen route={{params:{id:'project'}}} navigation={navigation}/>);expect(await s.findByText('1 nearby')).toBeTruthy();fireEvent.press(await s.findByLabelText('Find Folding table'));fireEvent.press(await s.findByText('Folding table nearby'));await waitFor(()=>expect(navigation.navigate).toHaveBeenCalledWith('ListingDetail',{id:'table',projectItemId:'slot'}));expect(api.createTransaction).not.toHaveBeenCalled();});
it('marks an owned item and refreshes its server state',async()=>{const s=render(<ProjectsScreen route={{params:{id:'project'}}} navigation={navigation}/>);fireEvent.press(await s.findByLabelText('I have Folding table'));await waitFor(()=>expect(api.updateProjectItem).toHaveBeenCalledWith('project','slot',{owned:true}));});
it('does not count pending, cancelled or returned requests as ready',()=>{const rows=['pending','approved','picked_up','cancelled','returned'].map(transactionStatus=>({transactionId:'t',transactionStatus}));expect(projectProgress(rows)).toEqual({covered:2,waiting:1,total:5});expect(projectItemState(rows[4]).label).toBe('Returned');});
it('offers recovery for a failed load',async()=>{api.getProject.mockRejectedValueOnce(new Error('offline'));const s=render(<ProjectsScreen route={{params:{id:'project'}}} navigation={navigation}/>);fireEvent.press(await s.findByText('Try again'));expect(await s.findByText('Folding table')).toBeTruthy();});

it('keeps optional extras out of the essential progress count',()=>{expect(projectProgress([{owned:true},{owned:false},{optional:true,owned:false}])).toEqual({covered:1,waiting:0,total:2});});
