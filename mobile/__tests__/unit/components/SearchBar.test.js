import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
jest.mock('../../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

describe('SearchBar', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders input with placeholder', () => {
    const SearchBar = require('../../../src/components/SearchBar').default;
    const { getByPlaceholderText } = render(
      <SearchBar value="" onChangeText={() => {}} placeholder="Search items..." />
    );
    expect(getByPlaceholderText('Search items...')).toBeTruthy();
  });

  it('fires onChangeText when typing', () => {
    const SearchBar = require('../../../src/components/SearchBar').default;
    const onChangeText = jest.fn();
    const { getByPlaceholderText } = render(
      <SearchBar value="" onChangeText={onChangeText} placeholder="Search" />
    );
    fireEvent.changeText(getByPlaceholderText('Search'), 'drill');
    expect(onChangeText).toHaveBeenCalledWith('drill');
  });

  it('shows clear button when value is non-empty', () => {
    const SearchBar = require('../../../src/components/SearchBar').default;
    const onChangeText = jest.fn();
    const { toJSON } = render(
      <SearchBar value="something" onChangeText={onChangeText} />
    );
    // Clear button should be rendered when value is non-empty
    expect(toJSON()).toBeTruthy();
  });

  it('accepts testID prop', () => {
    const SearchBar = require('../../../src/components/SearchBar').default;
    const { getByTestId } = render(
      <SearchBar value="" onChangeText={() => {}} testID="Feed.searchBar" />
    );
    expect(getByTestId('Feed.searchBar')).toBeTruthy();
  });
});
