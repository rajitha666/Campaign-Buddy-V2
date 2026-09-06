/**
 * Color tokens — copied 1:1 from the design system used in the HTML prototype
 * (mockups/styles.css). Do not introduce new colors ad hoc in screens/components;
 * add a named token here so the palette stays consistent and easy to re-theme.
 */
export const colors = {
  // Brand
  ink: '#12241F', // nav bars, dark cards, headers
  inkSoft: '#23413A',
  mango: '#FF7A33', // primary actions, active nav state
  mangoDark: '#E8641F',
  mangoTint: '#FFE6D6',

  // Surface
  surface: '#F4F6F3', // screen background
  surfaceCard: '#FFFFFF',
  line: '#E3E7E1', // borders/dividers

  // Text
  textPrimary: '#16211C',
  textMuted: '#647169',
  textInverse: '#F4F6F3',

  // Status
  success: '#1F9D55',
  successTint: '#E4F5EA',
  pending: '#C77F00',
  pendingTint: '#FBF0DA',
  alert: '#D8483F',
  alertTint: '#FBE6E4',
  info: '#2673B0',
  infoTint: '#E3F0FA',

  white: '#FFFFFF',
  overlay: 'rgba(10, 18, 15, 0.55)', // bottom-sheet scrim
} as const;

export type ColorToken = keyof typeof colors;
