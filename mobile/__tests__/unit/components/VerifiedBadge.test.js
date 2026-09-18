import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import VerifiedBadge from '../../../src/components/VerifiedBadge';
it('opens the compact identity explanation and dismisses with Got it', () => {
 const screen=render(<VerifiedBadge interactive />);
 fireEvent.press(screen.getByLabelText('Verified identity'));
 expect(screen.getByText('Identity verified')).toBeTruthy();
 expect(screen.getByText('This person verified their identity through Stripe.')).toBeTruthy();
 fireEvent.press(screen.getByText('Got it'));
 expect(screen.queryByText('Identity verified')).toBeNull();
});
