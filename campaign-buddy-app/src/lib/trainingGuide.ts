/**
 * The promoter field guide — the same task-based walkthrough shipped in the
 * web portal and on the marketing site (marketing/training/promoter.html).
 *
 * It opens in the device browser rather than being bundled: the app needs
 * connectivity for every screen anyway, and this keeps one source of truth for
 * the guide. Override the host per environment with EXPO_PUBLIC_TRAINING_URL
 * (e.g. a LAN IP while testing against a local marketing server).
 */
import { Alert, Linking } from 'react-native';

export const PROMOTER_GUIDE_URL =
  process.env.EXPO_PUBLIC_TRAINING_URL ?? 'https://campaignbuddy.lk/training/promoter.html';

export async function openPromoterGuide(): Promise<void> {
  try {
    const ok = await Linking.canOpenURL(PROMOTER_GUIDE_URL);
    if (!ok) throw new Error('cannot open url');
    await Linking.openURL(PROMOTER_GUIDE_URL);
  } catch {
    Alert.alert(
      'Guide unavailable',
      "Couldn't open the field guide. Check your connection and try again.",
    );
  }
}
