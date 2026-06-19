import { describe, it, expect, vi, beforeEach } from 'vitest';
import { batchGeocode, geocodeSearch } from '../src/util/geocode.js';

function nominatimResponse(results) {
  return { ok: true, json: () => Promise.resolve(results) };
}
function emptyResponse() {
  return nominatimResponse([]);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn());
});

describe('batchGeocode', () => {
  it('returns zeros when no eligible places', async () => {
    const result = batchGeocode({
      places: [{ id: 'p1', name: 'Dublin', latitude: 53.35, longitude: -6.26 }],
      hasQueueEntry: () => false,
      onResult: vi.fn(),
      onProgress: vi.fn(),
    });
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ fetched: 0, noResults: 0, total: 0 });
  });

  it('includes untyped places (no type filter)', async () => {
    const onResult = vi.fn();
    fetch.mockResolvedValueOnce(nominatimResponse([{ lat: '53', lon: '-6', display_name: 'Dublin', address: {}, importance: 0.5, addresstype: 'city' }]));
    const result = batchGeocode({
      places: [{ id: 'p1', name: 'Dublin', type: '', latitude: null, longitude: null }],
      hasQueueEntry: () => false,
      onResult,
      onProgress: vi.fn(),
    });
    await vi.runAllTimersAsync();
    await result;
    expect(onResult).toHaveBeenCalledTimes(1);
  });

  it('skips places already in the queue', async () => {
    const onResult = vi.fn();
    const result = batchGeocode({
      places: [{ id: 'p1', name: 'Dublin', latitude: null, longitude: null }],
      hasQueueEntry: (id) => id === 'p1',
      onResult,
      onProgress: vi.fn(),
    });
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ fetched: 0, noResults: 0, total: 0 });
  });

  it('fetches with limit=3 and addressdetails=1', async () => {
    fetch.mockResolvedValueOnce(emptyResponse());
    const result = batchGeocode({
      places: [{ id: 'p1', name: 'Springfield', latitude: null, longitude: null }],
      hasQueueEntry: () => false,
      onResult: vi.fn(),
      onProgress: vi.fn(),
    });
    await vi.runAllTimersAsync();
    await result;
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.searchParams.get('limit')).toBe('3');
    expect(url.searchParams.get('addressdetails')).toBe('1');
  });

  it('calls onResult with results for each place', async () => {
    const onResult = vi.fn();
    const results = [{ lat: '53', lon: '-6', display_name: 'Dublin, Ireland', address: { city: 'Dublin', country: 'Ireland' }, importance: 0.7, addresstype: 'city' }];
    fetch.mockResolvedValueOnce(nominatimResponse(results));
    const p = batchGeocode({
      places: [{ id: 'p1', name: 'Dublin', latitude: null, longitude: null }],
      hasQueueEntry: () => false,
      onResult,
      onProgress: vi.fn(),
    });
    await vi.runAllTimersAsync();
    await p;
    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1' }),
      results,
    );
  });

  it('calls onResult with empty array on no results', async () => {
    const onResult = vi.fn();
    fetch.mockResolvedValueOnce(emptyResponse());
    const p = batchGeocode({
      places: [{ id: 'p1', name: 'Nowhere', latitude: null, longitude: null }],
      hasQueueEntry: () => false,
      onResult,
      onProgress: vi.fn(),
    });
    await vi.runAllTimersAsync();
    await p;
    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1' }),
      [],
    );
  });

  it('reports progress', async () => {
    const onProgress = vi.fn();
    fetch.mockResolvedValueOnce(emptyResponse());
    fetch.mockResolvedValueOnce(emptyResponse());
    const p = batchGeocode({
      places: [
        { id: 'p1', name: 'A', latitude: null, longitude: null },
        { id: 'p2', name: 'B', latitude: null, longitude: null },
      ],
      hasQueueEntry: () => false,
      onResult: vi.fn(),
      onProgress,
    });
    await vi.runAllTimersAsync();
    await p;
    expect(onProgress).toHaveBeenCalledWith(1, 2);
    expect(onProgress).toHaveBeenCalledWith(2, 2);
  });

  it('stops on abort', async () => {
    const onResult = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const result = batchGeocode({
      places: [{ id: 'p1', name: 'A', latitude: null, longitude: null }],
      hasQueueEntry: () => false,
      onResult,
      onProgress: vi.fn(),
      signal: controller.signal,
    });
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ fetched: 0, noResults: 0, total: 0 });
    expect(onResult).not.toHaveBeenCalled();
  });

  it('returns correct summary counts', async () => {
    const hits = [{ lat: '1', lon: '2', display_name: 'A', address: {}, importance: 0.5, addresstype: 'city' }];
    fetch.mockResolvedValueOnce(nominatimResponse(hits));
    fetch.mockResolvedValueOnce(emptyResponse());
    fetch.mockResolvedValueOnce(nominatimResponse(hits));
    const p = batchGeocode({
      places: [
        { id: 'p1', name: 'A', latitude: null, longitude: null },
        { id: 'p2', name: 'B', latitude: null, longitude: null },
        { id: 'p3', name: 'C', latitude: null, longitude: null },
      ],
      hasQueueEntry: () => false,
      onResult: vi.fn(),
      onProgress: vi.fn(),
    });
    await vi.runAllTimersAsync();
    expect(await p).toEqual({ fetched: 2, noResults: 1, total: 3 });
  });
});

describe('geocodeSearch', () => {
  beforeEach(() => { vi.useRealTimers(); });

  it('returns [] for an empty query without fetching', async () => {
    const out = await geocodeSearch('   ');
    expect(out).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requests addressdetails and a result limit', async () => {
    fetch.mockResolvedValueOnce(nominatimResponse([]));
    await geocodeSearch('Rathmines, Dublin');
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.searchParams.get('q')).toBe('Rathmines, Dublin');
    expect(url.searchParams.get('format')).toBe('json');
    expect(url.searchParams.get('addressdetails')).toBe('1');
    expect(Number(url.searchParams.get('limit'))).toBeGreaterThanOrEqual(5);
  });

  it('normalizes results: numeric lat/lon and passes through address/name/class/addresstype', async () => {
    fetch.mockResolvedValueOnce(nominatimResponse([{
      lat: '53.3228', lon: '-6.2644',
      display_name: 'Rathmines, Dublin, Leinster, Ireland',
      address: { suburb: 'Rathmines', city: 'Dublin', country: 'Ireland' },
      importance: 0.55, addresstype: 'suburb', name: 'Rathmines', class: 'place', type: 'suburb',
    }]));
    const [r] = await geocodeSearch('Rathmines');
    expect(r.lat).toBeCloseTo(53.3228);
    expect(r.lon).toBeCloseTo(-6.2644);
    expect(r.display_name).toContain('Rathmines');
    expect(r.address).toEqual({ suburb: 'Rathmines', city: 'Dublin', country: 'Ireland' });
    expect(r.name).toBe('Rathmines');
    expect(r.class).toBe('place');
    expect(r.addresstype).toBe('suburb');
  });

  it('returns [] when the request is not ok', async () => {
    fetch.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve([]) });
    expect(await geocodeSearch('Nowhere')).toEqual([]);
  });
});
