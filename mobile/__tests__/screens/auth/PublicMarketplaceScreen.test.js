import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import api from '../../../src/services/api';
import PublicMarketplaceScreen from '../../../src/screens/auth/PublicMarketplaceScreen';
import PublicListingScreen from '../../../src/screens/auth/PublicListingScreen';

const navigation={navigate:jest.fn(),goBack:jest.fn()};
beforeEach(()=>{
  jest.clearAllMocks();
  api.getPublicListings=jest.fn().mockResolvedValue({items:[{id:'item-1',title:'Cordless saw',listingType:'lend',photoUrl:null}],hasMore:false});
  api.getPublicListing=jest.fn().mockResolvedValue({id:'item-1',title:'Cordless saw',description:'A handy saw',listingType:'lend',photoUrl:null});
});

it('browses and opens a public item before authentication',async()=>{
  const screen=render(<PublicMarketplaceScreen navigation={navigation}/>);
  fireEvent.press(await screen.findByLabelText('View Cordless saw'));
  expect(api.getPublicListings).toHaveBeenCalledWith({type:'all',search:'',page:1});
  expect(navigation.navigate).toHaveBeenCalledWith('PublicListing',{id:'item-1'});
  fireEvent.changeText(screen.getByLabelText('Search public items'),'saw');
  fireEvent(screen.getByLabelText('Search public items'),'submitEditing');
  await screen.findByText('Cordless saw');
  expect(api.getPublicListings).toHaveBeenCalledWith({type:'all',search:'saw',page:1});
});

it('shows item details and gates the account action',async()=>{
  const screen=render(<PublicListingScreen navigation={navigation} route={{params:{id:'item-1'}}}/>);
  expect(await screen.findByText('A handy saw')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Sign in or join to continue'));
  expect(navigation.navigate).toHaveBeenCalledWith('Welcome');
  expect(api.createListing).not.toHaveBeenCalled();
});
