import { describe, it, expect, vi } from 'vitest';
import { decomposeAddress } from '../src/util/decompose.js';

function mockHandlers(existingPlaces = []) {
  const created = [];
  return {
    findPlaceByNameTypeParent: vi.fn(async (name, type, parentId) => {
      return existingPlaces.find(p => p.name === name && p.type === type && p.parent_id === parentId) || null;
    }),
    createPlace: vi.fn(async (data) => {
      const place = { ...data };
      created.push(place);
      existingPlaces.push(place);
      return place;
    }),
    ensurePlaceType: vi.fn(async () => {}),
    updatePlace: vi.fn(async (id, fields) => ({ id, ...fields })),
    updateEvent: vi.fn(async (id, fields) => ({ id, ...fields })),
    deletePlace: vi.fn(async () => ({ ok: true })),
    getPlace: vi.fn(async (id) => existingPlaces.find(p => p.id === id) || null),
    _created: created,
  };
}

function makeIdGenerator() {
  let c = 0;
  return () => `id_${++c}`;
}

describe('decomposeAddress', () => {
  it('creates a chain from a simple address', async () => {
    const h = mockHandlers();
    await decomposeAddress({
      nominatimResult: {
        lat: 53.35, lon: -6.26,
        address: { city: 'Dublin', country: 'Ireland' },
      },
      originalPlaceId: 'orig1',
      eventIds: ['e1'],
      handlers: h,
      generateId: makeIdGenerator(),
    });

    expect(h.createPlace).toHaveBeenCalledTimes(2);
    // Country created first (no parent)
    expect(h._created[0].name).toBe('Ireland');
    expect(h._created[0].type).toBe('country');
    expect(h._created[0].parent_id).toBeNull();
    // City created under country
    expect(h._created[1].name).toBe('Dublin');
    expect(h._created[1].type).toBe('city');
    expect(h._created[1].parent_id).toBe(h._created[0].id);
    // Coords on most specific
    expect(h.updatePlace).toHaveBeenCalledWith(h._created[1].id, { latitude: 53.35, longitude: -6.26 });
    // Event repointed
    expect(h.updateEvent).toHaveBeenCalledWith('e1', { place_id: h._created[1].id, place: '' });
  });

  it('reuses existing place records', async () => {
    const ireland = { id: 'ie', name: 'Ireland', type: 'country', parent_id: null };
    const h = mockHandlers([ireland]);
    await decomposeAddress({
      nominatimResult: {
        lat: 53.35, lon: -6.26,
        address: { city: 'Dublin', country: 'Ireland' },
      },
      originalPlaceId: 'orig1',
      eventIds: ['e1'],
      handlers: h,
      generateId: makeIdGenerator(),
    });

    // Ireland was found, not created
    expect(h._created.length).toBe(1);
    expect(h._created[0].name).toBe('Dublin');
    expect(h._created[0].parent_id).toBe('ie');
  });

  it('skips non-ranked keys like postcode and country_code', async () => {
    const h = mockHandlers();
    await decomposeAddress({
      nominatimResult: {
        lat: 48.86, lon: 2.35,
        address: { city: 'Paris', country: 'France', postcode: '75004', country_code: 'fr' },
      },
      originalPlaceId: 'orig1',
      eventIds: ['e1'],
      handlers: h,
      generateId: makeIdGenerator(),
    });

    expect(h._created.length).toBe(2); // France + Paris only
    expect(h._created.map(p => p.name)).toEqual(['France', 'Paris']);
  });

  it('handles deep address chain', async () => {
    const h = mockHandlers();
    await decomposeAddress({
      nominatimResult: {
        lat: 48.85, lon: 2.36,
        address: {
          house_number: '10', road: 'Rue de Rivoli',
          suburb: 'Paris 4e Arrondissement', city: 'Paris',
          state: 'Île-de-France', country: 'France',
        },
      },
      originalPlaceId: 'orig1',
      eventIds: ['e1'],
      handlers: h,
      generateId: makeIdGenerator(),
    });

    const names = h._created.map(p => p.name);
    expect(names).toEqual(['France', 'Île-de-France', 'Paris', 'Paris 4e Arrondissement', 'Rue de Rivoli', '10']);
  });

  it('deletes the original flat place if no other events reference it', async () => {
    const orig = { id: 'orig1', name: 'Dublin, Ireland', type: '', parent_id: null };
    const h = mockHandlers([orig]);
    await decomposeAddress({
      nominatimResult: {
        lat: 53.35, lon: -6.26,
        address: { city: 'Dublin', country: 'Ireland' },
      },
      originalPlaceId: 'orig1',
      eventIds: ['e1'],
      handlers: h,
      generateId: makeIdGenerator(),
    });

    expect(h.deletePlace).toHaveBeenCalledWith('orig1');
  });

  it('appends a leaf POI when result.name has a class not in ADDRESS_RANK', async () => {
    const h = mockHandlers();
    await decomposeAddress({
      nominatimResult: {
        lat: 41.65, lon: -70.52,
        name: 'Otis Air National Guard Base',
        class: 'military',
        addresstype: 'military',
        address: {
          country: 'United States', state: 'Massachusetts',
          county: 'Barnstable County', town: 'Mashpee',
        },
      },
      originalPlaceId: 'orig1',
      eventIds: ['e1'],
      handlers: h,
      generateId: makeIdGenerator(),
    });
    const names = h._created.map(p => p.name);
    expect(names).toEqual([
      'United States', 'Massachusetts', 'Barnstable County', 'Mashpee',
      'Otis Air National Guard Base',
    ]);
    const types = h._created.map(p => p.type);
    expect(types[types.length - 1]).toBe('military');
    expect(h.ensurePlaceType).toHaveBeenCalledWith('military');
  });

  it('does not duplicate the leaf POI if its name already appears as a ranked part', async () => {
    const h = mockHandlers();
    await decomposeAddress({
      nominatimResult: {
        lat: 53.35, lon: -6.26,
        name: 'Dublin',
        class: 'place',
        address: { city: 'Dublin', country: 'Ireland' },
      },
      originalPlaceId: 'orig1',
      eventIds: ['e1'],
      handlers: h,
      generateId: makeIdGenerator(),
    });
    expect(h._created.length).toBe(2); // Ireland + Dublin only
  });

  it('truncates the chain at stopAtKey', async () => {
    const h = mockHandlers();
    await decomposeAddress({
      nominatimResult: {
        lat: 41.65, lon: -70.52,
        name: 'Otis Air National Guard Base',
        class: 'military',
        address: {
          country: 'United States', state: 'Massachusetts',
          county: 'Barnstable County', town: 'Mashpee',
        },
      },
      originalPlaceId: 'orig1',
      eventIds: ['e1'],
      handlers: h,
      generateId: makeIdGenerator(),
      stopAtKey: 'town',
    });
    const names = h._created.map(p => p.name);
    expect(names).toEqual(['United States', 'Massachusetts', 'Barnstable County', 'Mashpee']);
    expect(h.updatePlace).toHaveBeenCalledWith(h._created[h._created.length - 1].id, {
      latitude: 41.65, longitude: -70.52,
    });
  });

  it('calls ensurePlaceType for each key', async () => {
    const h = mockHandlers();
    await decomposeAddress({
      nominatimResult: {
        lat: 53.35, lon: -6.26,
        address: { city: 'Dublin', country: 'Ireland' },
      },
      originalPlaceId: 'orig1',
      eventIds: ['e1'],
      handlers: h,
      generateId: makeIdGenerator(),
    });

    expect(h.ensurePlaceType).toHaveBeenCalledWith('country');
    expect(h.ensurePlaceType).toHaveBeenCalledWith('city');
  });
});
