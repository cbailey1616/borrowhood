import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { haptics } from '../../../src/utils/haptics';

jest.unmock('../../../src/context/ErrorContext');
const { ErrorProvider, useError } = jest.requireActual('../../../src/context/ErrorContext');

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

const wrapper = ({ children }) => React.createElement(ErrorProvider, null, children);

describe('ErrorContext', () => {
  it('throws when useError used outside provider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      renderHook(() => useError());
    }).toThrow('useError must be used within ErrorProvider');
    spy.mockRestore();
  });

  it('provides showError, showToast, dismissError', () => {
    const { result } = renderHook(() => useError(), { wrapper });
    expect(typeof result.current.showError).toBe('function');
    expect(typeof result.current.showToast).toBe('function');
    expect(typeof result.current.dismissError).toBe('function');
  });

  it('showError fires error haptic for generic errors', () => {
    const { result } = renderHook(() => useError(), { wrapper });
    act(() => {
      result.current.showError({ message: 'Something failed' });
    });
    expect(haptics.error).toHaveBeenCalled();
  });

  it('showError fires success haptic for success type', () => {
    const { result } = renderHook(() => useError(), { wrapper });
    act(() => {
      result.current.showError({ type: 'success', message: 'Done!' });
    });
    expect(haptics.success).toHaveBeenCalled();
  });

  it('showError fires warning haptic for validation type', () => {
    const { result } = renderHook(() => useError(), { wrapper });
    act(() => {
      result.current.showError({ type: 'validation', message: 'Field required' });
    });
    expect(haptics.warning).toHaveBeenCalled();
  });

  it('showToast fires success haptic for success type', () => {
    const { result } = renderHook(() => useError(), { wrapper });
    act(() => {
      result.current.showToast('Saved!', 'success');
    });
    expect(haptics.success).toHaveBeenCalled();
  });

  it('showToast fires warning haptic for error type', () => {
    const { result } = renderHook(() => useError(), { wrapper });
    act(() => {
      result.current.showToast('Something went wrong');
    });
    expect(haptics.warning).toHaveBeenCalled();
  });

  it('showError auto-detects network type from message', () => {
    const { result } = renderHook(() => useError(), { wrapper });
    act(() => {
      result.current.showError({ message: 'Network connection failed' });
    });
    // Should fire error haptic (network type)
    expect(haptics.error).toHaveBeenCalled();
  });
});
