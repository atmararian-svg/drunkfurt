import type { ComponentType } from 'react';
import type { CameraTrack } from '../core/cameraTrack';
import type { CameraPose } from '../core/sequence';
import type { EpisodeId } from '../core/timeline';

/** A comic caption box, shown while the episode's local progress is inside [from, to]. */
export interface Caption {
  from: number;
  to: number;
  text: string;
  /** Small line above the text (place, time, speaker). */
  kicker?: string;
  /** Screen corner, like a caption box placed on a comic panel. */
  place: 'tl' | 'tr' | 'bl' | 'br';
  /**
   * 'speech': someone speaking (typed in at the bottom of the page); 'tip': the
   * system telling you what to do (the ACTION box, bottom left, ui/textBoxes.ts);
   * anything else: his thoughts (the box by his face, bottom right). `place`
   * only places a speech caption.
   */
  tone?: 'yellow' | 'paper' | 'speech' | 'tip';
  /** Only shown when this holds (e.g. one caption per outcome of an interaction). */
  when?: () => boolean;
  /** A balloon's text is typed in (ui/typewriter.ts); called each time it has been typed in full. */
  onTyped?: () => void;
}

export interface EpisodeDef {
  id: EpisodeId;
  number: number;
  title: string;
  subtitle: string;
  /**
   * The 3D world. Mounted while the episode is active or about to be; `active`
   * is false while it is preloading behind the previous episode.
   */
  World: ComponentType<{ active: boolean }>;
  /**
   * Plays inside another episode's world (drawn and running while this one is
   * active), e.g. episode 3 on the street where episode 2 ended.
   */
  sharesWorld?: EpisodeId;
  /** Scroll-driven camera path over local progress 0..1. */
  track: CameraTrack;
  /** Optional per-frame adjustment of the sampled camera pose (e.g. keep a subject in frame). */
  adjustPose?: (local: number, pose: CameraPose) => void;
  captions: Caption[];
  /**
   * Puts the episode's own state back to its beginning (interactions, their
   * gates, anything remembered across frames). Called when its chapter starts
   * (again): entering it, or going back into it.
   */
  reset?: () => void;
  /** Local progress values a click advances between. */
  beats: number[];
  /**
   * Keeps the camera's look-around movement inside the scene: given the
   * composed camera position and the offset the visitor's head wants, return
   * the offset to use (default: unchanged).
   */
  clampHead?: (base: { x: number; y: number; z: number }, offset: { x: number; y: number; z: number }) => void;
}
