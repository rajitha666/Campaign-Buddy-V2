// Direct import (not the `@/theme` barrel) to keep this module free of
// react-native imports so it stays unit-testable in vitest's node env.
import { colors } from '@/theme/colors';

/** Base tab-bar metrics without the Android nav-bar inset (see MainTabs/SupervisorTabs). */
export const BASE_TAB_BAR_HEIGHT = 76;
export const BASE_TAB_BAR_PADDING_BOTTOM = 18;
const BASE_TAB_BAR_PADDING_TOP = 8;

export function buildTabBarStyle(bottomInset: number) {
  return {
    borderTopColor: colors.line,
    height: BASE_TAB_BAR_HEIGHT + bottomInset,
    paddingTop: BASE_TAB_BAR_PADDING_TOP,
    paddingBottom: BASE_TAB_BAR_PADDING_BOTTOM + bottomInset,
  };
}
