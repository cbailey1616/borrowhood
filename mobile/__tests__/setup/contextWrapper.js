/**
 * Test wrapper providing AuthContext and ErrorContext for integration-style tests.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createMockUser, createMockNavigation, setupErrorMock } from './testUtils';

/**
 * Renders a component wrapped with both AuthContext and ErrorContext providers.
 *
 * @param {React.ReactElement} component - The component to render
 * @param {Object} options
 * @param {Object} options.user - User overrides for the auth context
 * @param {Object} options.navigation - Navigation mock overrides
 * @param {Object} options.route - Route params
 * @returns {Object} - render result from @testing-library/react-native
 */
export function renderWithProviders(component, { user = {}, navigation, route } = {}) {
  const mockUser = createMockUser(user);
  const mockNavigation = navigation || createMockNavigation();
  const mockErrorContext = setupErrorMock();

  // Clone the component with navigation and route props
  const wrappedComponent = React.cloneElement(component, {
    navigation: mockNavigation,
    route: route || { params: {} },
  });

  return {
    ...render(wrappedComponent),
    mockUser,
    mockNavigation,
    mockErrorContext,
  };
}
