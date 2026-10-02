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

  it('showError stays quiet by default for generic errors', () => {
    const { result } = renderHook(() => useError(), { wrapper });
    act(() => {
      result.current.showError({ message: 'Something failed' });
    });
    expect(haptics.error).not.toHaveBeenCalled();
  });

  it('showError stays quiet unless success feedback is explicit', () => {
    const { result } = renderHook(() => useError(), { wrapper });
    act(() => {
      result.current.showError({ type: 'success', message: 'Done!' });
    });
    expect(haptics.success).not.toHaveBeenCalled();
  });

  it('showError stays quiet by default for validation', () => {
    const { result } = renderHook(() => useError(), { wrapper });
    act(() => {
      result.current.showError({ type: 'validation', message: 'Field required' });
    });
    expect(haptics.warning).not.toHaveBeenCalled();
  });

  it('showToast stays quiet by default for success messages', () => {
    const { result } = renderHook(() => useError(), { wrapper });
    act(() => {
      result.current.showToast('Saved!', 'success');
    });
    expect(haptics.success).not.toHaveBeenCalled();
  });

  it('showToast stays quiet by default for error messages', () => {
    const { result } = renderHook(() => useError(), { wrapper });
    act(() => {
      result.current.showToast('Something went wrong');
    });
    expect(haptics.warning).not.toHaveBeenCalled();
  });

  it('supports intentional feedback when explicitly requested', () => {
    const { result } = renderHook(() => useError(), { wrapper });
    act(() => result.current.showError({ message: 'Review this change', haptic: 'warning' }));
    expect(haptics.warning).toHaveBeenCalledTimes(1);
  });

  it('showError auto-detects network type from message', () => {
    const { result } = renderHook(() => useError(), { wrapper });
    act(() => {
      result.current.showError({ message: 'Network connection failed' });
    });
    // Error classification does not introduce automatic feedback.
    expect(haptics.error).not.toHaveBeenCalled();
  });
});
