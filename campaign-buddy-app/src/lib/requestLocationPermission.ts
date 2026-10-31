import { Alert, Platform } from 'react-native';
import * as Location from 'expo-location';
import { getJSON, setJSON } from '@/offline/storage';
import {
  LOCATION_DISCLOSURE_MESSAGE,
  LOCATION_DISCLOSURE_TITLE,
  withLocationDisclosure,
} from '@/lib/locationDisclosure';

const SHOWN_KEY = 'locationDisclosureShown';

// Native dialog; the web build (Expo web, used only for e2e smoke) has no Alert, so it goes straight to the browser prompt.
const showDisclosure = (): Promise<boolean> =>
  Platform.OS === 'web'
    ? Promise.resolve(true)
    : new Promise((resolve) => {
        Alert.alert(
          LOCATION_DISCLOSURE_TITLE,
          LOCATION_DISCLOSURE_MESSAGE,
          [
            { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Continue', onPress: () => resolve(true) },
          ],
          { cancelable: false }
        );
      });

/** Foreground location permission request, preceded once per device by the prominent disclosure. */
export const requestLocationPermission = withLocationDisclosure(Location.requestForegroundPermissionsAsync, {
  isGranted: async () => (await Location.getForegroundPermissionsAsync()).status === 'granted',
  wasShown: async () => (await getJSON<boolean>(SHOWN_KEY, true)) === true,
  markShown: () => setJSON(SHOWN_KEY, true, true),
  show: showDisclosure,
});
