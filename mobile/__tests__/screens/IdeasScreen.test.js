import React from 'react';
import { render } from '@testing-library/react-native';
import IdeasScreen from '../../src/screens/IdeasScreen';
const mockProjects = jest.fn(() => null);
jest.mock('../../src/screens/ProjectsScreen', () => props => mockProjects(props));
it('embeds the tested project workflow and passes navigation through', () => {
  const navigation = { navigate: jest.fn() };
  const s = render(<IdeasScreen navigation={navigation} />);
  expect(s.getByText('Ideas')).toBeTruthy();
  expect(mockProjects).toHaveBeenCalledWith(expect.objectContaining({ embedded: true, navigation, route: {} }));
});
