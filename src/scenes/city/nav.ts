import { makeNav, Obstacle, Region } from '../../characters/nav';
import { KIOSK, LAMP_X, LAMP_Z, PLAZA, PLAZA_LAMPS, SHELTER, STREET, TRAFFIC_LIGHTS, TREES } from './layout';

/** Where people may stand: the station square and both sidewalks. */
export const CITY_REGIONS: Region[] = [
  { x0: PLAZA.x0, x1: PLAZA.x1, z0: PLAZA.z0 + 0.4, z1: PLAZA.z1 - 0.6, what: 'station square' },
  { x0: STREET.halfRoad + 0.3, x1: STREET.curbOuter - 0.3, z0: STREET.z1, z1: STREET.z0 - 0.4, what: 'right sidewalk' },
  { x0: -STREET.curbOuter + 0.3, x1: -STREET.halfRoad - 0.3, z0: STREET.z1, z1: STREET.z0 - 0.4, what: 'left sidewalk' },
];

export const CITY_OBSTACLES: Obstacle[] = [
  ...LAMP_Z.flatMap((z) => [
    { kind: 'circle' as const, x: LAMP_X, z, r: 0.16, what: `lamp ${z}` },
    { kind: 'circle' as const, x: -LAMP_X, z, r: 0.16, what: `lamp ${z}` },
  ]),
  ...TREES.map(([x, z]) => ({ kind: 'circle' as const, x, z, r: 0.3, what: `tree ${x},${z}` })),
  ...PLAZA_LAMPS.map(([x, z]) => ({ kind: 'circle' as const, x, z, r: 0.2, what: 'square lamp' })),
  ...TRAFFIC_LIGHTS.map(([x, z]) => ({ kind: 'circle' as const, x, z, r: 0.12, what: 'traffic light' })),
  { kind: 'box', x: KIOSK.x, z: KIOSK.z, hx: KIOSK.hx, hz: KIOSK.hz, what: 'kiosk' },
  { kind: 'box', x: SHELTER.x, z: SHELTER.z, hx: SHELTER.hx, hz: SHELTER.hz, what: 'tram shelter' },
];

export const cityNav = makeNav(CITY_REGIONS, CITY_OBSTACLES);
