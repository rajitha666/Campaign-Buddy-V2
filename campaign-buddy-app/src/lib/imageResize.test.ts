import { describe, it, expect } from 'vitest';
import { resizeTarget } from './imageResize';

// Phone photos are 3000–4000px and several MB — too heavy for a 2G upload.
// Only the longer side is given, so the aspect ratio is preserved.
describe('resizeTarget', () => {
  it('shrinks a landscape photo to the max width', () => {
    expect(resizeTarget(4000, 3000, 1600)).toEqual({ width: 1600 });
  });

  it('shrinks a portrait photo to the max height', () => {
    expect(resizeTarget(3000, 4000, 1600)).toEqual({ height: 1600 });
  });

  it('leaves photos that are already small enough', () => {
    expect(resizeTarget(1200, 800, 1600)).toBeNull();
    expect(resizeTarget(1600, 900, 1600)).toBeNull();
  });

  it('does nothing when the size is unknown', () => {
    expect(resizeTarget(0, 0, 1600)).toBeNull();
  });
});
