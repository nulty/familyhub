import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { geocodePlaces } from '../src/util/geocode.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function nominatimResponse(lat, lon) {
  return {
    ok: true,
    json: async () => [{ lat: String(lat), lon: String(lon) }],
  };
}

function emptyResponse() {
  return { ok: true, json: async () => [] };
}

function errorResponse() {
  return { ok: false, json: async () => [] };
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('geocodePlaces', () => {
  it('returns zeros when no places are eligible', async () => {
    const result = await geocodePlaces({
      getPlaces: async () => [
        { id: '1', name: 'Dublin', type: 'city', latitude: 53.35, longitude: -6.26 }, // already geocoded
        { id: '2', name: 'Unknown', type: '', latitude: null, longitude: null }, // no type
      ],
      getHierarchy: async () => [],
      updatePlace: async () => {},
      onProgress: () => {},
    });
    expect(result).toEqual({ geocoded: 0, notFound: 0, total: 0 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('filters eligible places correctly', async () => {
    mockFetch.mockResolvedValue(nominatimResponse(53.35, -6.26));
    const updatePlace = vi.fn();

    const promise = geocodePlaces({
      getPlaces: async () => [
        { id: '1', name: 'Dublin', type: 'city', latitude: null, longitude: null }, // eligible
        { id: '2', name: 'Cork', type: 'city', latitude: 51.9, longitude: -8.47 }, // already has coords
        { id: '3', name: 'Fragment', type: '', latitude: null, longitude: null }, // no type
      ],
      getHierarchy: async (id) => [{ id, name: 'Dublin', type: 'city' }],
      updatePlace,
      onProgress: () => {},
    });

    await vi.runAllTimersAsync();
    await promise;

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(updatePlace).toHaveBeenCalledTimes(1);
    expect(updatePlace).toHaveBeenCalledWith('1', { latitude: 53.35, longitude: -6.26 });
  });

  it('builds query from hierarchy with County prefix', async () => {
    mockFetch.mockResolvedValue(nominatimResponse(53.35, -6.26));

    const promise = geocodePlaces({
      getPlaces: async () => [
        { id: '3', name: 'Rathmines', type: 'suburb', latitude: null, longitude: null },
      ],
      getHierarchy: async () => [
        { id: '1', name: 'Ireland', type: 'country' },
        { id: '2', name: 'Dublin', type: 'county' },
        { id: '3', name: 'Rathmines', type: 'suburb' },
      ],
      updatePlace: async () => {},
      onProgress: () => {},
    });

    await vi.runAllTimersAsync();
    await promise;

    // Query should be reversed: most specific first, with "County" prefix on Dublin
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain('Rathmines');
    expect(url).toContain('County+Dublin');
    expect(url).toContain('Ireland');
    // Rathmines should come before County Dublin in the query
    const qParam = new URL(url).searchParams.get('q');
    expect(qParam).toBe('Rathmines, County Dublin, Ireland');
  });

  it('calls onProgress after each place', async () => {
    mockFetch.mockResolvedValue(nominatimResponse(53.35, -6.26));
    const onProgress = vi.fn();

    const promise = geocodePlaces({
      getPlaces: async () => [
        { id: '1', name: 'Dublin', type: 'city', latitude: null, longitude: null },
        { id: '2', name: 'Cork', type: 'city', latitude: null, longitude: null },
      ],
      getHierarchy: async (id) => [{ id, name: 'Test', type: 'city' }],
      updatePlace: async () => {},
      onProgress,
    });

    await vi.runAllTimersAsync();
    await promise;

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2);
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2);
  });

  it('counts not-found when Nominatim returns empty results', async () => {
    mockFetch.mockResolvedValue(emptyResponse());

    const promise = geocodePlaces({
      getPlaces: async () => [
        { id: '1', name: 'Atlantis', type: 'city', latitude: null, longitude: null },
      ],
      getHierarchy: async (id) => [{ id, name: 'Atlantis', type: 'city' }],
      updatePlace: async () => {},
      onProgress: () => {},
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ geocoded: 0, notFound: 1, total: 1 });
  });

  it('counts not-found on HTTP errors', async () => {
    mockFetch.mockResolvedValue(errorResponse());

    const promise = geocodePlaces({
      getPlaces: async () => [
        { id: '1', name: 'Dublin', type: 'city', latitude: null, longitude: null },
      ],
      getHierarchy: async (id) => [{ id, name: 'Dublin', type: 'city' }],
      updatePlace: async () => {},
      onProgress: () => {},
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ geocoded: 0, notFound: 1, total: 1 });
  });

  it('counts not-found on network errors', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const promise = geocodePlaces({
      getPlaces: async () => [
        { id: '1', name: 'Dublin', type: 'city', latitude: null, longitude: null },
      ],
      getHierarchy: async (id) => [{ id, name: 'Dublin', type: 'city' }],
      updatePlace: async () => {},
      onProgress: () => {},
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ geocoded: 0, notFound: 1, total: 1 });
  });

  it('stops on abort signal', async () => {
    const controller = new AbortController();
    controller.abort(); // abort immediately

    const promise = geocodePlaces({
      getPlaces: async () => [
        { id: '1', name: 'Dublin', type: 'city', latitude: null, longitude: null },
        { id: '2', name: 'Cork', type: 'city', latitude: null, longitude: null },
      ],
      getHierarchy: async (id) => [{ id, name: 'Test', type: 'city' }],
      updatePlace: async () => {},
      onProgress: () => {},
      signal: controller.signal,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    // Should have processed 0 places since signal was already aborted
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.geocoded).toBe(0);
  });

  it('breaks on AbortError from fetch without counting as notFound', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    mockFetch.mockRejectedValue(abortError);

    const promise = geocodePlaces({
      getPlaces: async () => [
        { id: '1', name: 'Dublin', type: 'city', latitude: null, longitude: null },
        { id: '2', name: 'Cork', type: 'city', latitude: null, longitude: null },
      ],
      getHierarchy: async (id) => [{ id, name: 'Test', type: 'city' }],
      updatePlace: async () => {},
      onProgress: () => {},
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(mockFetch).toHaveBeenCalledTimes(1); // only first, then break
    expect(result.notFound).toBe(0); // AbortError doesn't count
  });

  it('returns correct summary counts for mixed results', async () => {
    mockFetch
      .mockResolvedValueOnce(nominatimResponse(53.35, -6.26)) // success
      .mockResolvedValueOnce(emptyResponse()) // not found
      .mockResolvedValueOnce(nominatimResponse(51.9, -8.47)); // success

    const promise = geocodePlaces({
      getPlaces: async () => [
        { id: '1', name: 'Dublin', type: 'city', latitude: null, longitude: null },
        { id: '2', name: 'Atlantis', type: 'city', latitude: null, longitude: null },
        { id: '3', name: 'Cork', type: 'city', latitude: null, longitude: null },
      ],
      getHierarchy: async (id) => [{ id, name: 'Test', type: 'city' }],
      updatePlace: async () => {},
      onProgress: () => {},
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ geocoded: 2, notFound: 1, total: 3 });
  });
});
