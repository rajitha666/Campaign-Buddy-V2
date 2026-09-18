import { Alert, Platform } from 'react-native';

/**
 * react-native-web's Alert.alert is a no-op (no native dialog), so error
 * popups silently vanish in the Expo web build unless we fall back to
 * window.alert there.
 */
export function showAlert(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
