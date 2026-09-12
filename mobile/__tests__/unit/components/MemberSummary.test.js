import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { render, fireEvent, within } from '@testing-library/react-native';
import MemberSummary from '../../../src/components/MemberSummary';
import VerifiedBadge from '../../../src/components/VerifiedBadge';

jest.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('../../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));

it('shows the acorn beside a new neighbor’s profile name using the actual completed count', () => {
  const screen = render(<MemberSummary profileHeader user={{ totalTransactions: 6, endorsement: { completedCount: 1, score: null } }}>
    <Text>Chris Bailey</Text>
  </MemberSummary>);
  const identity = within(screen.getByTestId('MemberSummary.identity'));
  expect(identity.getByText('Chris Bailey')).toBeTruthy();
  fireEvent.press(identity.getByRole('button', { name: 'Neighbor rank: New neighbor' }));
  expect(screen.getByText('Rating after 3 completed exchanges')).toBeTruthy();
  expect(screen.queryByText(/1 completed exchange/)).toBeNull();
});

it.each([false, true])('shows the rank beside the name without an exchange count in profile headers (centered: %s)', centered => {
  const screen = render(<MemberSummary profileHeader centered={centered} user={{ endorsement: { completedCount: 6, score: 85 } }}>
    <Text>Chris Bailey</Text><VerifiedBadge />
  </MemberSummary>);
  const identity = within(screen.getByTestId('MemberSummary.identity'));
  expect(identity.getByText('Chris Bailey')).toBeTruthy();
  expect(identity.getByText('Archer')).toBeTruthy();
  expect(identity.getByLabelText('Verified identity')).toBeTruthy();
  expect(screen.queryByText(/completed exchanges/)).toBeNull();
  expect(StyleSheet.flatten(screen.getByTestId('MemberSummary.identity').props.style)).toMatchObject({ flexWrap: 'nowrap', alignItems: 'center' });
  fireEvent.press(identity.getByLabelText('Neighbor rank: Archer'));
  const row = within(screen.getByTestId('RankInfo.level.Archer'));
  expect(row.getByText('Archer')).toBeTruthy();
  expect(row.getByText('Good')).toBeTruthy();
});

it.each([false, true])('keeps profile names clear until a real rank is available (centered: %s)', centered => {
  const screen = render(<MemberSummary profileHeader centered={centered} user={{ totalTransactions: 6 }}>
    <Text>Chris Bailey</Text><VerifiedBadge />
  </MemberSummary>);
  expect(screen.getByText('Chris Bailey')).toBeTruthy();
  expect(screen.getByLabelText('Verified identity')).toBeTruthy();
  expect(screen.queryByText('Rank unavailable')).toBeNull();
  expect(screen.queryByLabelText(/Neighbor rank/)).toBeNull();
  expect(screen.queryByText('New neighbor')).toBeNull();
  expect(screen.queryByText(/completed exchanges/)).toBeNull();
  screen.rerender(<MemberSummary profileHeader centered={centered} user={{ endorsement: { completedCount: 6, score: 85 } }}>
    <Text>Chris Bailey</Text><VerifiedBadge />
  </MemberSummary>);
  fireEvent.press(screen.getByRole('button', { name: 'Neighbor rank: Archer' }));
  expect(within(screen.getByTestId('RankInfo.level.Archer')).getByText('Current')).toBeTruthy();
});

it('opens rating details from a notification and clears the request on close', () => {
  const onRatingClose = jest.fn();
  const screen = render(<MemberSummary user={{ endorsement: { completedCount: 6, score: 90 } }} openRating onRatingClose={onRatingClose} />);
  expect(screen.getByLabelText('Rating level: Great')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Close rank explanation'));
  expect(onRatingClose).toHaveBeenCalledTimes(1);
  screen.rerender(<MemberSummary user={{ endorsement: { completedCount: 6, score: 90 } }} openRating={false} onRatingClose={onRatingClose} />);
  expect(screen.queryByText('Rating levels')).toBeNull();
});

it('shows a temporary New neighbor state, not a sixth tier or a hidden score', () => {
  const screen = render(<MemberSummary user={{ endorsement: { completedCount: 2, count: 1, percent: 100, score: null } }} />);
  expect(screen.getByLabelText('Neighbor rating: New neighbor')).toBeTruthy();
  expect(screen.queryByText('New neighbor')).toBeNull();
  expect(screen.getByText('2 completed exchanges')).toBeTruthy();
  expect(screen.queryByText(/100%|Endorsed/)).toBeNull();
  fireEvent.press(screen.getByLabelText('Neighbor rating: New neighbor'));
  expect(screen.getByText('Rating after 3 completed exchanges')).toBeTruthy();
  expect(screen.getAllByTestId(/^RankInfo.level\./)).toHaveLength(5);
  expect(screen.queryByTestId('RankInfo.level.New neighbor')).toBeNull();
  expect(screen.queryByText('Current')).toBeNull();
  expect(screen.queryByLabelText(/Rating level:/)).toBeNull();
});

it('replaces New neighbor with the qualitative rating and highlights only its tier', () => {
  const screen = render(<MemberSummary user={{ endorsement: { completedCount: 2, score: null } }} />);
  screen.rerender(<MemberSummary user={{ endorsement: { completedCount: 3, score: 78 } }} />);
  expect(screen.queryByText('New neighbor')).toBeNull();
  expect(screen.getByLabelText('Neighbor rating: Good, Archer')).toBeTruthy();
  expect(screen.queryByText('Good')).toBeNull();
  expect(screen.queryByText('Archer')).toBeNull();
  expect(screen.queryByText('78')).toBeNull();
  fireEvent.press(screen.getByLabelText('Neighbor rating: Good, Archer'));
  expect(screen.getByLabelText('Rating level: Good')).toBeTruthy();
  expect(within(screen.getByTestId('RankInfo.level.Archer')).getByText('Current')).toBeTruthy();
  expect(screen.getAllByText('Current')).toHaveLength(1);
  expect(screen.queryByText(/0\s*[-\u2013]\s*59|97\s*[-\u2013]\s*100|out of 100/)).toBeNull();
  expect(screen.getByText('Build your rank with positive exchanges.')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Close rank explanation'));
  expect(screen.queryByText('Rating levels')).toBeNull();
});

it('keeps missing rating data distinct from being a new member', () => {
  const screen = render(<MemberSummary user={{ totalTransactions: 20, endorsement: { percent: 100, count: 20 } }} />);
  expect(screen.getByText('20 completed exchanges')).toBeTruthy();
  expect(screen.queryByLabelText(/Neighbor rating:/)).toBeNull();
  expect(screen.queryByText('New neighbor')).toBeNull();
  expect(screen.queryByText('100%')).toBeNull();
  expect(screen.queryByText('Rating levels')).toBeNull();
  expect(screen.queryByText('Current')).toBeNull();
});

it.each([false, true])('keeps the name, verification, and tappable rank together (centered: %s)', centered => {
  const screen = render(<MemberSummary user={{ endorsement: { completedCount: 6, score: 85 } }} centered={centered}>
    <Text style={{ flexShrink: 1 }}>Alexandra Very Long Display Name</Text>
    <VerifiedBadge />
  </MemberSummary>);
  const identity = within(screen.getByTestId('MemberSummary.identity'));
  expect(identity.getByText('Alexandra Very Long Display Name')).toBeTruthy();
  expect(identity.getByLabelText('Verified identity')).toBeTruthy();
  const badge = identity.getByRole('button', { name: 'Neighbor rating: Good, Archer' });
  expect(StyleSheet.flatten(badge.props.style)).toMatchObject({ width: 44, minHeight: 44 });
  expect(identity.queryByText('6 completed exchanges')).toBeNull();
  expect(screen.getByText('6 completed exchanges')).toBeTruthy();
  const stopPropagation = jest.fn();
  fireEvent.press(badge, { stopPropagation });
  expect(stopPropagation).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Neighbor rating')).toBeTruthy();
});
