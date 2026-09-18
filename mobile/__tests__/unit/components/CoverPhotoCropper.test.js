import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PanResponder } from 'react-native';
import CoverPhotoCropper from '../../../src/components/CoverPhotoCropper';
const mockCrop = jest.fn(), mockResize = jest.fn(), mockSave = jest.fn(), mockRelease = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: jest.fn(() => {
    let cropped = false;
    return { crop: rect => { cropped = true; mockCrop(rect); }, resize: mockResize, release: mockRelease,
      renderAsync: async () => ({ release: mockRelease, saveAsync: options => mockSave(cropped, options) }) };
  }) },
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockSave.mockImplementation(async cropped => ({ uri: cropped ? 'file:///cropped.jpg' : 'file:///normalized.jpg', width: 3000, height: 2000 }));
  jest.spyOn(PanResponder, 'create').mockImplementation(handlers => ({ panHandlers: {
    onResponderGrant: handlers.onPanResponderGrant, onResponderMove: handlers.onPanResponderMove,
  } }));
});
afterEach(() => jest.restoreAllMocks());
const photo = { uri: 'file:///camera.jpg' };

it('exports the selected wide crop after zooming and dragging, then releases native images', async () => {
  const onComplete = jest.fn();
  const screen = render(<CoverPhotoCropper photo={photo} onComplete={onComplete} onCancel={jest.fn()} />);
  await screen.findByLabelText('Cover crop preview');
  for (let n = 0; n < 4; n++) fireEvent.press(screen.getByLabelText('Zoom in'));
  const frame = screen.getByTestId('CoverCrop.frame');
  fireEvent(frame, 'responderGrant', { nativeEvent: { touches: [{ pageX: 100, pageY: 100, locationX: 100, locationY: 50 }] } });
  fireEvent(frame, 'responderMove', { nativeEvent: { touches: [{ pageX: 10000, pageY: 10000, locationX: 10000, locationY: 10000 }] } });
  fireEvent.press(screen.getByLabelText('Use cover photo'));
  await waitFor(() => expect(onComplete).toHaveBeenCalledWith('file:///cropped.jpg'));
  expect(mockCrop).toHaveBeenCalledWith({ originX: 0, originY: 0, width: 1500, height: 500 });
  expect(mockResize).toHaveBeenCalledWith({ width: 1200 });
  expect(mockRelease).toHaveBeenCalledTimes(4);
});
it('pinches around the touch midpoint', async () => {
  const screen = render(<CoverPhotoCropper photo={photo} onComplete={jest.fn()} onCancel={jest.fn()} />);
  await screen.findByLabelText('Cover crop preview');
  const frame = screen.getByTestId('CoverCrop.frame');
  const width = frame.props.style[1].width, height = frame.props.style[1].height;
  const touches = distance => [-1, 1].map(sign => ({ pageX: width / 2 + sign * distance, pageY: height / 2, locationX: width / 2 + sign * distance, locationY: height / 2 }));
  fireEvent(frame, 'responderGrant', { nativeEvent: { touches: touches(40) } });
  fireEvent(frame, 'responderMove', { nativeEvent: { touches: touches(80) } });
  expect(screen.getByText('200%')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Use cover photo'));
  await waitFor(() => expect(mockCrop).toHaveBeenCalledWith({ originX: 750, originY: 750, width: 1500, height: 500 }));
});
it('cancels without exporting or accepting a replacement', async () => {
  const onCancel = jest.fn(), onComplete = jest.fn();
  const screen = render(<CoverPhotoCropper photo={photo} onComplete={onComplete} onCancel={onCancel} />);
  await screen.findByLabelText('Cover crop preview');
  fireEvent.press(screen.getByLabelText('Cancel cover crop'));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onComplete).not.toHaveBeenCalled();
  expect(mockCrop).not.toHaveBeenCalled();
});
it('allows retry after export fails and ignores completion after unmount', async () => {
  const onComplete = jest.fn();
  const screen = render(<CoverPhotoCropper photo={photo} onComplete={onComplete} onCancel={jest.fn()} />);
  await screen.findByLabelText('Cover crop preview');
  mockSave.mockRejectedValueOnce(new Error('Disk error'));
  fireEvent.press(screen.getByLabelText('Use cover photo'));
  await screen.findByText('Couldn’t crop this photo. Try again.');
  expect(onComplete).not.toHaveBeenCalled();
  let finish;
  mockSave.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.press(screen.getByLabelText('Use cover photo'));
  await waitFor(() => expect(finish).toBeDefined());
  screen.unmount();
  await act(async () => finish({ uri: 'file:///late.jpg' }));
  expect(onComplete).not.toHaveBeenCalled();
});
