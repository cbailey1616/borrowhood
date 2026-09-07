import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import api from '../../src/services/api';
beforeEach(() => { api.getFunnelInsights = jest.fn(); });
it('offers retry on denied or failed insights without showing fabricated counts', async () => {
  api.getFunnelInsights.mockRejectedValueOnce(new Error('Denied')).mockResolvedValueOnce({ signups: 4, onboardingRate: 50 });
  const Screen = require('../../src/screens/InsightsScreen').default;
  const screen = render(<Screen />);
  const error = await screen.findByText(/Administrator access is required/);
  expect(screen.queryByText('New accounts')).toBeNull();
  fireEvent.press(error);
  await screen.findByText('New accounts');
  expect(api.getFunnelInsights).toHaveBeenCalledTimes(2);
});
