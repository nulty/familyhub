import { describe, it, expect, vi, afterEach } from 'vitest';
import { reverseGeocode } from '../src/util/geocode.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch(response, ok = true) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => response })));
}

describe('reverseGeocode', () => {
  it('normalizes a jsonv2 reverse result, mapping category to class', async () => {
    mockFetch({
      lat: '53.3498', lon: '-6.2603',
      display_name: 'Dublin, Leinster, Ireland',
      name: 'Dublin',
      category: 'boundary',
      addresstype: 'city',
      importance: 0.8,
      address: { city: 'Dublin', county: 'Dublin', country: 'Ireland' },
    });
    const result = await reverseGeocode(53.3498, -6.2603);
    expect(result.lat).toBeCloseTo(53.3498);
    expect(result.lon).toBeCloseTo(-6.2603);
    expect(result.class).toBe('boundary');
    expect(result.addresstype).toBe('city');
    expect(result.address.country).toBe('Ireland');
  });

  it('returns null for a Nominatim error payload', async () => {
    mockFetch({ error: 'Unable to geocode' });
    expect(await reverseGeocode(0, 0)).toBeNull();
  });

  it('returns null on a failed request', async () => {
    mockFetch({}, false);
    expect(await reverseGeocode(53, -6)).toBeNull();
  });

  it('returns null for invalid coordinates without fetching', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    expect(await reverseGeocode(null, -6)).toBeNull();
    expect(await reverseGeocode(NaN, -6)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
