jest.mock('expo-image', () => ({ Image: { loadAsync: jest.fn() } }));
const { Image } = require('expo-image');
const { getDecodedImage, loadDecodedImage } = require('../../src/utils/decodedImageCache');
const { API_URL } = require('../../src/utils/config');

it('shares one decode and reuses its native ref after remount', async () => {
  let finish;
  Image.loadAsync.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const first = loadDecodedImage('photo-1');
  const second = loadDecodedImage('photo-1');
  expect(second).toBe(first);
  const ref = { nativeRef: 1 };
  finish(ref);
  await first;
  expect(getDecodedImage('photo-1')).toBe(ref);
  expect(await loadDecodedImage('photo-1')).toBe(ref);
  expect(Image.loadAsync).toHaveBeenCalledTimes(1);
});
it('allows retry after a failed decode', async () => {
  Image.loadAsync.mockRejectedValueOnce(new Error('offline'));
  await expect(loadDecodedImage('retry')).rejects.toThrow('offline');
  Image.loadAsync.mockResolvedValueOnce({ nativeRef: 2 });
  await expect(loadDecodedImage('retry')).resolves.toEqual({ nativeRef: 2 });
});
it('bounds retained refs and never substitutes another photo', async () => {
  Image.loadAsync.mockImplementation(async uri => ({ uri }));
  for (let i = 0; i < 17; i++) await loadDecodedImage(`bounded-${i}`);
  expect(getDecodedImage('bounded-0')).toBeUndefined();
  expect(getDecodedImage('bounded-16')).toEqual({ uri: 'bounded-16' });
  expect(getDecodedImage('unknown')).toBeUndefined();
});

it('deduplicates rotating private URLs across screens using a stable native cache key', async () => {
  Image.loadAsync.mockClear();
  let finish;
  Image.loadAsync.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const key = 'b'.repeat(64);
  const uri = `${API_URL}/private-photos/token-one?photo=${key}`;
  const refreshed = `${API_URL}/private-photos/token-two?photo=${key}`;
  const first = loadDecodedImage(uri);
  expect(loadDecodedImage(refreshed)).toBe(first);
  const ref = { nativeRef: 25 };
  finish(ref);
  await first;
  expect(getDecodedImage(refreshed)).toBe(ref);
  expect(await loadDecodedImage(refreshed)).toBe(ref);
  expect(Image.loadAsync).toHaveBeenCalledTimes(1);
  expect(Image.loadAsync).toHaveBeenCalledWith({ uri, cacheKey: `${API_URL}/private-photos/cache/${key}` }, expect.any(Object));
  expect(getDecodedImage(`${API_URL}/private-photos/token?photo=${'c'.repeat(64)}`)).toBeUndefined();
  expect(getDecodedImage(`https://other-host.test/api/private-photos/token?photo=${key}`)).toBeUndefined();
});
