import { describe, expect, it } from 'vitest';
import { BASE_TAB_BAR_HEIGHT, BASE_TAB_BAR_PADDING_BOTTOM, buildTabBarStyle } from './tabBarStyle';

describe('buildTabBarStyle', () => {
  it('returns the unchanged base style when the bottom inset is 0', () => {
    expect(buildTabBarStyle(0)).toMatchObject({
      height: BASE_TAB_BAR_HEIGHT,
      paddingTop: 8,
      paddingBottom: BASE_TAB_BAR_PADDING_BOTTOM,
    });
  });

  it('adds the bottom safe-area inset to height and bottom padding', () => {
    const style = buildTabBarStyle(24);
    expect(style.height).toBe(BASE_TAB_BAR_HEIGHT + 24);
    expect(style.paddingBottom).toBe(BASE_TAB_BAR_PADDING_BOTTOM + 24);
  });

  it('keeps the base border and border color', () => {
    expect(buildTabBarStyle(12).borderTopColor).toBe(buildTabBarStyle(0).borderTopColor);
  });
});
