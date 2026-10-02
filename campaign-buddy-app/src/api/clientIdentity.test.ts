import { describe, it, expect } from 'vitest';
import { clientIdentityHeaders } from './clientIdentity';
import appVersion from '../../version.json';

/**
 * Every request identifies the build, so each tenant backend can report a real
 * app-version distribution and gate clients below its floor with a 426.
 * See docs/multi-tenant-release-strategy.md section 3.4.
 */
describe('clientIdentityHeaders', () => {
  it('reports version, build, platform and the contract the app was built against', () => {
    expect(clientIdentityHeaders('android')).toEqual({
      'X-CB-App-Version': appVersion.version,
      'X-CB-App-Build': String(appVersion.build),
      'X-CB-Platform': 'android',
      'X-CB-Contract': String(appVersion.contract),
    });
  });

  it('derives the build number from the version, so the two cannot drift', () => {
    // app.json, android/app/build.gradle and package.json are all generated from
    // version.json by `npm run version:sync` -- they had already drifted
    // (1.0.13 / 1.0.4 / 100013) before it existed.
    const [major, minor, patch] = appVersion.version.split('.').map(Number);
    expect(appVersion.build).toBe(major * 100_000 + minor * 1_000 + patch);
  });
});
