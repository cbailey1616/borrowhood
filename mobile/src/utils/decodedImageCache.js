import { Image } from 'expo-image';

// Bound decoded memory separately from Expo's disk cache. Retained native refs
// can be displayed synchronously when a list cell mounts again.
const images = new Map();
const pending = new Map();
const LIMIT = 16;
export function getDecodedImage(uri) {
  const image = images.get(uri);
  if (image) { images.delete(uri); images.set(uri, image); }
  return image;
}
export function loadDecodedImage(uri) {
  const cached = getDecodedImage(uri);
  if (cached) return Promise.resolve(cached);
  if (pending.has(uri)) return pending.get(uri);
  const request = Image.loadAsync(uri, { maxWidth: 800, maxHeight: 800 }).then(image => {
    images.set(uri, image);
    while (images.size > LIMIT) images.delete(images.keys().next().value);
    return image;
  }).finally(() => pending.delete(uri));
  pending.set(uri, request);
  return request;
}
