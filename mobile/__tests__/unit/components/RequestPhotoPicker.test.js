import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import RequestPhotoPicker from '../../../src/components/RequestPhotoPicker';
const mockShowError = jest.fn();
jest.mock('../../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError }) }));
beforeEach(() => { jest.clearAllMocks(); });
it('takes a photo and returns its local URI for the existing upload flow', async () => {
 ImagePicker.launchCameraAsync.mockResolvedValueOnce({canceled:false,assets:[{uri:'file:///camera.jpg'}]});
 const change=jest.fn();const screen=render(<RequestPhotoPicker onChange={change}/>);
 fireEvent.press(screen.getByLabelText('Add request photo'));
 fireEvent.press(await screen.findByTestId('RequestPhoto.camera'));
 await waitFor(()=>expect(change).toHaveBeenCalledWith('file:///camera.jpg'));
 expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalled();
 expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
});
it('keeps the existing photo when camera capture is cancelled', async () => {
 ImagePicker.launchCameraAsync.mockResolvedValueOnce({canceled:true});
 const change=jest.fn();const screen=render(<RequestPhotoPicker uri="https://test.example/existing.jpg" onChange={change}/>);
 fireEvent.press(screen.getByLabelText('Change request photo'));
 fireEvent.press(await screen.findByTestId('RequestPhoto.camera'));
 await waitFor(()=>expect(ImagePicker.launchCameraAsync).toHaveBeenCalled());
 expect(change).not.toHaveBeenCalled();
});
it('explains denied camera permission and leaves the form intact', async () => {
 ImagePicker.requestCameraPermissionsAsync.mockResolvedValueOnce({status:'denied',granted:false});
 const change=jest.fn();const screen=render(<RequestPhotoPicker onChange={change}/>);
 fireEvent.press(screen.getByLabelText('Add request photo'));
 fireEvent.press(await screen.findByTestId('RequestPhoto.camera'));
 await waitFor(()=>expect(mockShowError).toHaveBeenCalledWith(expect.objectContaining({message:expect.stringContaining('camera access')})));
 expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();expect(change).not.toHaveBeenCalled();
});
