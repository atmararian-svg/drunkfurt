import { useMemo } from 'react';
import { People } from '../../characters/People';
import { localProgress } from '../../core/timeline';
import { createCrowd, crowdPositions } from './crowd';

/** The people of the station (cast in crowd.ts), rendered by the shared character system. */
export function Passengers() {
  const crowd = useMemo(() => createCrowd(), []);
  return (
    <People
      crowd={crowd}
      scroll={() => localProgress('station')}
      onStep={(c) => {
        crowdPositions.length = 0;
        crowdPositions.push(...c.positions);
      }}
    />
  );
}
