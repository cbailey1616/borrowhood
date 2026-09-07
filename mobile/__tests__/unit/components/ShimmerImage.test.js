import React from 'react';
import { act, render } from '@testing-library/react-native';
import { Image } from 'expo-image';
import ShimmerImage from '../../../src/components/ShimmerImage';
import { getDecodedImage, loadDecodedImage } from '../../../src/utils/decodedImageCache';

// Observe the props committed to the native boundary, rather than mocking the
// app's image component or only testing the cache Map.
jest.mock('expo-image', () => {
  const React = require('react');
  const { View } = require('react-native');
  class Image extends React.PureComponent {
    static loadAsync = jest.fn();
    static mounted = jest.fn();
    static sources = [];
    componentDidMount() {
      Image.mounted();
      Image.sources.push(this.props.source);
    }
    componentDidUpdate(previous) {
      if (previous.source !== this.props.source) Image.sources.push(this.props.source);
    }
    render() { return <View testID="native-photo" {...this.props} />; }
  }
  return { Image };
});
jest.mock('../../../src/utils/decodedImageCache', () => ({
  getDecodedImage: jest.fn(), loadDecodedImage: jest.fn(),
}));
jest.mock('../../../src/components/SkeletonLoader', () => 'PhotoSkeleton');

const uri = 'https://images.example/ladder.jpg';
const ref = { __expo_shared_object_id__: 1 };
const style = { width: 100, height: 100 };
function CacheChangeAtCommit({ change, children }) {
  React.useLayoutEffect(change, [change]);
  return children;
}
let finish;
beforeEach(() => {
  jest.clearAllMocks();
  finish = undefined;
  Image.sources = [];
  getDecodedImage.mockReset();
  loadDecodedImage.mockReset();
  loadDecodedImage.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
});

it('uses one loading path: it never starts a URL load while decoding the same photo', async () => {
  const screen = render(<ShimmerImage source={{ uri }} style={style} />);
  expect(Image.sources).toEqual([null]);
  await act(async () => finish(ref));
  expect(screen.getByTestId('native-photo').props.source).toBe(ref);
  expect(Image.sources).toEqual([null, ref]);
  expect(loadDecodedImage).toHaveBeenCalledTimes(1);
  expect(Image.mounted).toHaveBeenCalledTimes(1);
});

it('keeps the same native view and source when fresh API objects contain the same URL', async () => {
  const screen = render(<ShimmerImage source={{ uri }} style={style} />);
  await act(async () => finish(ref));
  const nativeView = screen.getByTestId('native-photo');
  Image.sources = [];
  screen.rerender(<ShimmerImage source={{ uri }} style={{ ...style }} />);
  screen.rerender(<ShimmerImage source={{ uri }} style={{ ...style }} />);
  expect(screen.getByTestId('native-photo')).toBe(nativeView);
  expect(screen.getByTestId('native-photo').props.source).toBe(ref);
  expect(Image.sources).toEqual([]);
  expect(Image.mounted).toHaveBeenCalledTimes(1);
  expect(loadDecodedImage).toHaveBeenCalledTimes(1);
});

it('starts with the cached native image when the photo mounts on another screen', () => {
  getDecodedImage.mockReturnValue(ref);
  const first = render(<ShimmerImage source={{ uri }} style={style} />);
  first.unmount();
  render(<ShimmerImage source={{ uri }} style={style} />);
  expect(Image.sources).toEqual([ref, ref]);
  expect(loadDecodedImage).not.toHaveBeenCalled();
});

it('retains its displayed ref when another screen evicts and reloads the same URL', () => {
  getDecodedImage.mockReturnValue(ref);
  const screen = render(<ShimmerImage source={{ uri }} style={style} />);
  Image.sources = [];
  const reloadedRef = { __expo_shared_object_id__: 3 };
  getDecodedImage.mockReturnValue(reloadedRef);
  screen.rerender(<ShimmerImage source={{ uri }} style={style} />);
  expect(screen.getByTestId('native-photo').props.source).toBe(ref);
  expect(Image.sources).toEqual([]);
});

it('receives a cache entry that becomes ready between render and effect', async () => {
  // Model another instance completing after render, before passive effects run.
  // Using the commit phase keeps this independent of the number of cache reads.
  const screen = render(
    <CacheChangeAtCommit change={() => { getDecodedImage.mockReturnValue(ref); }}>
      <ShimmerImage source={{ uri }} style={style} />
    </CacheChangeAtCommit>
  );
  await act(async () => {});
  expect(screen.getByTestId('native-photo').props.source).toBe(ref);
});

it('does not discard a displayed image if its cache entry is evicted before the effect', async () => {
  getDecodedImage.mockReturnValue(ref);
  loadDecodedImage.mockRejectedValueOnce(new Error('offline'));
  const screen = render(
    <CacheChangeAtCommit change={() => { getDecodedImage.mockReturnValue(undefined); }}>
      <ShimmerImage source={{ uri }} style={style} />
    </CacheChangeAtCommit>
  );
  await act(async () => {});
  expect(screen.getByTestId('native-photo').props.source).toBe(ref);
  expect(Image.sources).toEqual([ref]);
});

it('ignores a late result for the previous photo and never shows it for a new URL', async () => {
  const screen = render(<ShimmerImage source={{ uri }} style={style} />);
  const oldFinish = finish;
  const newUri = 'https://images.example/drill.jpg';
  screen.rerender(<ShimmerImage source={{ uri: newUri }} style={style} />);
  await act(async () => oldFinish(ref));
  expect(screen.getByTestId('native-photo').props.source).toBeNull();
  const newRef = { __expo_shared_object_id__: 2 };
  await act(async () => finish(newRef));
  expect(screen.getByTestId('native-photo').props.source).toBe(newRef);
  expect(Image.sources).not.toContain(ref);
});

it('isolates a changed photo from native recycling and previous load callbacks', () => {
  getDecodedImage.mockReturnValue(ref);
  const screen = render(<ShimmerImage source={{ uri }} style={style} />);
  const oldView = screen.getByTestId('native-photo');
  const nextRef = { __expo_shared_object_id__: 4 };
  getDecodedImage.mockReturnValue(nextRef);
  screen.rerender(<ShimmerImage source={{ uri: 'https://images.example/new-photo.jpg' }} style={style} />);
  expect(screen.getByTestId('native-photo')).not.toBe(oldView);
  expect(screen.getByTestId('native-photo').props.source).toBe(nextRef);
  expect(Image.sources).toEqual([ref, nextRef]);
});

it('falls back to the URL only if decoding fails', async () => {
  loadDecodedImage.mockRejectedValueOnce(new Error('decode failed'));
  const screen = render(<ShimmerImage source={{ uri }} style={style} />);
  await act(async () => {});
  expect(Image.sources).toEqual([null, uri]);
  expect(screen.getByTestId('native-photo').props.source).toBe(uri);
});
