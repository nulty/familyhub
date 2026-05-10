import { describe, it, expect } from 'vitest';
import { groupTypes, TYPE_GROUPS } from '../src/util/place-type-seeds.js';

describe('groupTypes', () => {
  it('groups built-in nominatim types most specific first', () => {
    const types = [
      { key: 'country', label: 'Country', source: 'nominatim' },
      { key: 'state', label: 'State', source: 'nominatim' },
      { key: 'town', label: 'Town', source: 'nominatim' },
      { key: 'road', label: 'Road', source: 'nominatim' },
    ];
    const groups = groupTypes(types);
    expect(groups.map(g => g.label)).toEqual([
      'Street', 'Settlement', 'Subdivision', 'National',
    ]);
    expect(groups.at(-1).types[0].key).toBe('country');
  });

  it('orders keys within each group most specific first, not alphabetically', () => {
    const types = [
      { key: 'borough', label: 'Borough', source: 'nominatim' },
      { key: 'city', label: 'City', source: 'nominatim' },
      { key: 'municipality', label: 'Municipality', source: 'nominatim' },
    ];
    const municipal = groupTypes(types).find(g => g.label === 'Municipal');
    expect(municipal.types.map(t => t.key)).toEqual(['borough', 'city', 'municipality']);
  });

  it('puts unknown nominatim types into Facility / POI alphabetised by label', () => {
    const types = [
      { key: 'office', label: 'Office', source: 'nominatim' },
      { key: 'amenity', label: 'Amenity', source: 'nominatim' },
      { key: 'military', label: 'Military', source: 'nominatim' },
    ];
    const groups = groupTypes(types);
    const poi = groups.find(g => g.label === 'Facility / POI');
    expect(poi).toBeTruthy();
    expect(poi.types.map(t => t.label)).toEqual(['Amenity', 'Military', 'Office']);
  });

  it('puts custom types in their own group at the end', () => {
    const types = [
      { key: 'country', label: 'Country', source: 'nominatim' },
      { key: 'townland', label: 'Townland', source: 'custom' },
      { key: 'civil_parish', label: 'Civil Parish', source: 'custom' },
    ];
    const groups = groupTypes(types);
    expect(groups.at(-1).label).toBe('Custom');
    expect(groups.at(-1).types.map(t => t.label)).toEqual(['Civil Parish', 'Townland']);
  });

  it('omits empty groups', () => {
    const types = [{ key: 'country', label: 'Country', source: 'nominatim' }];
    const groups = groupTypes(types);
    expect(groups.length).toBe(1);
    expect(groups[0].label).toBe('National');
  });

  it('TYPE_GROUPS keys are all present in some group definition (no orphans in the rank)', () => {
    const allGroupKeys = new Set(TYPE_GROUPS.flatMap(g => g.keys));
    expect(allGroupKeys.has('country')).toBe(true);
    expect(allGroupKeys.has('road')).toBe(true);
    expect(allGroupKeys.has('farm')).toBe(true);
  });
});
