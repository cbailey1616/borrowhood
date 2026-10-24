import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
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

it('overlaps the bold heading with the scene while keeping tabs separate', () => {
  const screen = render(<WoodlandHeader title="My items"><Text>Items</Text></WoodlandHeader>);
  const artworkBand = screen.getByTestId('Header.artworkBand', { includeHiddenElements: true });
  const content = screen.getByTestId('Header.content');
  expect(artworkBand.findAllByType(Text)).toHaveLength(0);
  expect(content.findAllByType(Text).map(node => node.props.children)).toEqual(['My items', 'Items']);
  expect(StyleSheet.flatten(content.props.style)).toMatchObject({ backgroundColor: 'transparent', marginTop: -88 });
  expect(screen.queryByTestId('Woodland.tabs.fade', { includeHiddenElements: true })).toBeNull();
});

it('keeps the semibold profile heading without decorative artwork', () => {
  const screen = render(<WoodlandHeader title="Profile" artwork={false} />);
  expect(screen.queryByTestId('Woodland.artwork', { includeHiddenElements: true })).toBeNull();
  expect(StyleSheet.flatten(screen.getByText('Profile').props.style).fontFamily).toBe('DMSans_600SemiBold');
});

// A scene can live inside a sheet or a header narrower than the device window.
it('uses the measured header bounds without squeezing the artwork', () => {
  const screen = render(<FeedWoodlandBackdrop width={951} />);
  fireEvent(screen.getByTestId('Woodland.frame', { includeHiddenElements: true }), 'layout', {
    nativeEvent: { layout: { width: 760, height: 128 } },
  });
  const image = screen.getByTestId('Woodland.artwork', { includeHiddenElements: true });
  const source = Array.isArray(image.props.source) ? image.props.source[0] : image.props.source;
  expect(decodeURIComponent(source.uri.split(',')[1])).toContain('width="760" height="128" viewBox="0 48 760 128"');
  expect(image.props.contentFit).toBe('cover');
});

it('crops a short ribbon while retaining the original scene geometry', () => {
  const svg = feedWoodlandSvg(0, 466, 128);
  expect(svg).toContain(FEED_WOODLAND_SCENES[0].draw(466));
  expect(svg).toContain('viewBox="0 48 466 128"');
});
