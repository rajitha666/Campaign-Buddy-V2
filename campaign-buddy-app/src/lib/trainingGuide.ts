/**
 * Task-based walkthroughs shipped in the web portal and on the marketing site
 * (marketing/training/{promoter,supervisor}.html).
 *
 * They open in the device browser rather than being bundled: the app needs
 * connectivity for every screen anyway, and this keeps one source of truth for
 * the guide. Override the host per environment with EXPO_PUBLIC_TRAINING_URL
 * (e.g. a LAN IP while testing against a local marketing server) — it's the
 * full promoter.html URL, as documented in .env.example; the supervisor guide
 * is derived from it by swapping the filename so the same override works for
 * both without a second env var.
 */
import { Alert, Linking } from 'react-native';

export const PROMOTER_GUIDE_URL =
  process.env.EXPO_PUBLIC_TRAINING_URL ?? 'https://campaignbuddy.lk/training/promoter.html';
export const SUPERVISOR_GUIDE_URL = PROMOTER_GUIDE_URL.replace(/promoter\.html$/, 'supervisor.html');

async function openGuide(url: string): Promise<void> {
  try {
    const ok = await Linking.canOpenURL(url);
    if (!ok) throw new Error('cannot open url');
    await Linking.openURL(url);
  } catch {
    Alert.alert(
      'Guide unavailable',
      "Couldn't open the field guide. Check your connection and try again.",
    );
  }
}

export const openPromoterGuide = () => openGuide(PROMOTER_GUIDE_URL);
export const openSupervisorGuide = () => openGuide(SUPERVISOR_GUIDE_URL);
