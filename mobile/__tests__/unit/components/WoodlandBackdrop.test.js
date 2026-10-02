import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { LinearGradient } from 'expo-linear-gradient';
import FeedWoodlandBackdrop from '../../../src/components/FeedWoodlandBackdrop';
import WoodlandHeader from '../../../src/components/WoodlandHeader';
import { FEED_WOODLAND_SCENES, feedWoodlandSvg } from '../../../src/assets/feed-woodland-scenes';

jest.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ feedWoodlandScene: 4 }) }));

it.each(FEED_WOODLAND_SCENES.map((scene, index) => [scene.id, index]))('extends the sky without changing %s geometry', (_id, index) => {
  for (const width of [320, 393, 768, 1180]) {
    const svg = feedWoodlandSvg(index, width, 254);
    expect(svg).toContain(`width="${width}" height="254" viewBox="0 -78 ${width} 254"`);
    expect(svg).toContain(FEED_WOODLAND_SCENES[index].draw(width));
    const screen = render(<FeedWoodlandBackdrop width={width} sceneIndex={index} height={254} />);
    const image = screen.getByTestId('Woodland.artwork', { includeHiddenElements: true });
    const source = Array.isArray(image.props.source) ? image.props.source[0] : image.props.source;
    expect(decodeURIComponent(source.uri.split(',')[1])).toBe(svg);
    expect(StyleSheet.flatten(image.props.style)).toMatchObject({ top: 0, height: 254 });
    screen.unmount();
  }
});

it('preserves the default geometry and rejects invalid canvas dimensions', () => {
  expect(feedWoodlandSvg(0, 393)).toContain('height="176" viewBox="0 0 393 176"');
  expect(feedWoodlandSvg(0, NaN, Infinity)).toContain('width="402" height="176" viewBox="0 0 402 176"');
});

it('fades only behind ribbon content without adding a selectable surface', () => {
  const screen = render(<WoodlandHeader title="My Posts"><Text>Items</Text></WoodlandHeader>);
  const fade = screen.UNSAFE_getAllByType(LinearGradient).find(node => node.props.testID === 'Woodland.tabs.fade');
  expect(fade.props.pointerEvents).toBe('none');
  expect(fade.props.accessible).toBe(false);
  expect(fade.props.locations).toEqual([0, 0.3, 0.7, 1]);
  expect(fade.props.colors[1]).toMatch(/EF$/);
  expect(screen.getByText('Items')).toBeTruthy();
  screen.rerender(<WoodlandHeader title="Profile" />);
  expect(screen.queryByTestId('Woodland.tabs.fade', { includeHiddenElements: true })).toBeNull();
});

it('keeps the semibold profile heading without decorative artwork', () => {
  const screen = render(<WoodlandHeader title="Profile" artwork={false} />);
  expect(screen.queryByTestId('Woodland.artwork', { includeHiddenElements: true })).toBeNull();
  expect(StyleSheet.flatten(screen.getByText('Profile').props.style).fontFamily).toBe('DMSans_600SemiBold');
});
