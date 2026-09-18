import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { PickedPhoto } from '@/api/supervisorChecklist';
import { resizeTarget } from '@/lib/imageResize';

export class CameraPermissionError extends Error {
  constructor() {
    super('Camera access is needed to take outlet photos. Allow it for Campaign Buddy in your phone settings.');
  }
}

// Long side of an uploaded photo. Readable for a shelf/display setup, and a few
// hundred KB instead of the several MB a phone camera produces.
const MAX_SIDE = 1600;

/**
 * Opens the camera and returns the shot (resized, JPEG), or null if the
 * supervisor cancels. Native is camera-only — there is deliberately no gallery
 * option, so a photo can't be reused from another day or outlet. Web has no
 * camera API for the picker, so the Expo web build (used for automated smoke
 * tests) falls back to the file chooser.
 */
export async function capturePhoto(): Promise<PickedPhoto | null> {
  const isWeb = Platform.OS === 'web';
  if (!isWeb) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new CameraPermissionError();
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const result = isWeb ? await ImagePicker.launchImageLibraryAsync(options) : await ImagePicker.launchCameraAsync(options);
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];

  let context = ImageManipulator.manipulate(asset.uri);
  const target = resizeTarget(asset.width, asset.height, MAX_SIDE);
  if (target) context = context.resize(target);
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
  return { uri: saved.uri, name: `outlet-${Date.now()}.jpg`, type: 'image/jpeg' };
}
