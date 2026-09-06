/**
 * Typography tokens.
 *
 * The web prototype pairs Poppins (headers, big numbers, brand name) with a
 * plain system sans (body text, data). We do the same here:
 *  - `display` family = Poppins SemiBold, loaded via expo-font (see App.tsx)
 *  - `body` family = the OS default (San Francisco on iOS, Roboto on Android)
 *    — intentionally NOT overridden, since it's already optimized for each
 *    platform's text rendering and matches what the mockups call "body copy".
 *
 * Usage: import { fontFamily, fontSize } from '@/theme/typography'
 */
import { Platform } from 'react-native';

export const fontFamily = {
  display: 'Poppins-SemiBold', // must match the name passed to Font.loadAsync in App.tsx
  displayBold: 'Poppins-Bold',
  body: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
};

export const fontSize = {
  xs: 10.5,
  sm: 12,
  base: 13,
  md: 14.5,
  lg: 17,
  xl: 20,
  xxl: 26,
  display: 30,
};

export const lineHeight = {
  tight: 1.2,
  normal: 1.4,
  relaxed: 1.55,
};
