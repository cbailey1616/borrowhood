import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
const mockShowError = jest.fn();

jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: jest.fn() }) }));

beforeEach(() => { jest.clearAllMocks(); api.getCategories.mockResolvedValue([{ id: 'cat-1', name: 'Tools', slug: 'tools-hardware' }]); api.updateRequest.mockResolvedValue({}); });

describe('EditRequestScreen', () => {
  const request = { id: 'req-1', type: 'item', title: 'Need a Drill', description: 'For home project', categoryId: 'cat-1', visibility: ['close_friends'], neededFrom: null, neededUntil: null };
  const route = { params: { request } };

  it('pre-populates title from route.params', () => {
    const Screen = require('../../src/screens/EditRequestScreen').default;
    const { getByDisplayValue } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(getByDisplayValue('Need a Drill')).toBeTruthy();
  });

  it('pre-populates description', () => {
    const Screen = require('../../src/screens/EditRequestScreen').default;
    const { getByDisplayValue } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(getByDisplayValue('For home project')).toBeTruthy();
  });

  it('save calls api.updateRequest', async () => {
    const Screen = require('../../src/screens/EditRequestScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await act(async () => { fireEvent.press(getByText(/Save/i)); });
    expect(api.updateRequest).toHaveBeenCalled();
  });

  it('validates required title', async () => {
    const emptyRoute = { params: { request: { ...request, title: '' } } };
    const Screen = require('../../src/screens/EditRequestScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} route={emptyRoute} />);
    await act(async () => { fireEvent.press(getByText(/Save/i)); });
    expect(mockShowError).toHaveBeenCalled();
  });

  it('title is editable', () => {
    const Screen = require('../../src/screens/EditRequestScreen').default;
    const { getByDisplayValue } = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.changeText(getByDisplayValue('Need a Drill'), 'Updated Title');
  });
});
