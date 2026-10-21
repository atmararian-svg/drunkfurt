import { PARK } from '../car/getaway';
import { STREET } from './layout';
import { Box, CAR_BOX, CarDef, createTraffic, makeLane } from './traffic';

/**
 * The city's traffic plan: lanes, parked cars and the moving cars' schedules.
 *
 * Lanes keep clear of the parked cars: those stand with their centres 3.95 m
 * from the middle of the boulevard (1.84 m wide over the tyres), so the
 * driving lanes run at ±1.75 m, leaving 0.36 m on each side.
 */
export const LANE_X = 1.75;

/** Parked cars: x, z, heading, colour. */
export const PARKED: [number, number, number, number][] = [
  [-3.95, -30, Math.PI, 0],
  [-3.95, -66, Math.PI, 2],
  [-3.95, -122, 0, 1],
  // (the Mercedes of episode 3 stands at the kerb at z = -41.5; this one leaves it room to pull out)
  [3.95, -64, 0, 3],
  [3.95, -86, Math.PI, 1],
  [3.95, -142, 0, 0],
];

/** The parked cars, and the Mercedes (episode 3's car, parked at the kerb on the right). */
export const parkedBoxes = (): Box[] => [...PARKED.map(([x, z, yaw]) => ({ x, z, yaw, ...CAR_BOX })), { x: PARK.x, z: PARK.z, yaw: Math.PI, ...CAR_BOX }];

/** Moving cars, with what they are for. */
export const CITY_CARS = () => {
  const turnIn = makeLane([[-80, -19.2], [LANE_X, -19.2], [LANE_X, STREET.z1 - 10]], 5.5);
  const across = makeLane([[80, -14.2], [-80, -14.2]]);
  const outOf = makeLane([[-LANE_X, STREET.z1 - 10], [-LANE_X, -14.2], [-80, -14.2]], 4.5);
  const defs: (CarDef & { color: number; pass: { at: number; from: number; to: number } })[] = [
    // along the cross street, then turning into the boulevard ahead of you, down towards the towers
    { lane: turnIn, speed: 9.5, period: 46, offset: 6, priority: 1, color: 2, pass: { at: 0.15, from: -0.8, to: 0.2 } },
    // straight along the cross street, right to left
    { lane: across, speed: 11, period: 27, offset: 18, priority: 0, color: 0, pass: { at: 0.4, from: 0.9, to: -0.9 } },
    // up the boulevard towards the station, turning into the cross street: crosses the first car's lane and merges into the second's
    { lane: outOf, speed: 9, period: 53, offset: 0, priority: 2, color: 1, pass: { at: 0.93, from: -0.2, to: -0.9 } },
  ];
  return defs;
};

export const cityTraffic = () => createTraffic(CITY_CARS(), parkedBoxes());
