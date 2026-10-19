/**
 * Episode 2 layout, in metres. Ground (plaza, sidewalks) is y = 0; the road is
 * 15 cm lower. The visitor leaves the station through its main portal and walks
 * down a long, straight boulevard (in the spirit of Kaiserstraße) that leads
 * from the station towards the towers of the banking district.
 * +x is right when looking down the street, -z is towards the skyline.
 */
export const ROAD_Y = -0.15;

export const STATION_FACE_Z = 6;
export const PORTAL = { x: 1.5, halfWidth: 4.2, height: 9.5 };

/** Station square between the portal and the cross street. */
export const PLAZA = { x0: -30, x1: 30, z0: -11.5, z1: STATION_FACE_Z } as const;
/** Cross street with tram tracks, between the square and the boulevard. */
export const CROSS = { z0: -22, z1: -11.5 } as const;
/** The boulevard. */
export const STREET = { halfRoad: 5, curbOuter: 9.5, z0: -22, z1: -430 } as const;
/** Side streets cutting across the boulevard (gaps in the building rows). */
export const SIDE_STREETS: [number, number][] = [
  [-150, -164],
  [-268, -282],
];
export const EYE = 1.68;

/** Street lamps: both curbs, every 18 m. */
export const LAMP_X = 5.55;
export const LAMP_Z: number[] = Array.from({ length: 22 }, (_, i) => -27 - i * 18);
/** Bare trees along the building side of the sidewalks; the right side is kept clear where the encounter happens. */
export const TREES: [number, number][] = [
  [-7.9, -31], [-7.9, -52], [-7.9, -88], [-7.9, -110], [-7.9, -132], [-7.9, -190], [-7.9, -214],
  [7.9, -25], [7.9, -72], [7.9, -94], [7.9, -116], [7.9, -190], [7.9, -232],
];

export const KIOSK = { x: -11.5, z: -3.5, hx: 1.6, hz: 1.3 };
export const SHELTER = { x: 11.6, z: -9.6, hx: 2.4, hz: 0.75 };
export const TRAFFIC_LIGHTS: [number, number][] = [
  [5.6, -21.9],
  [-5.6, -21.9],
];
export const PLAZA_LAMPS: [number, number][] = [
  [-6.5, -7],
  [9.0, -5],
];

/** Where the stranger first stands (in a doorway), and where the visitor stops. */
export const ATTACKER_START: [number, number] = [8.55, -58];
export const VISITOR_STOP: [number, number] = [6.5, -34];
