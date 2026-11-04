/**
 * His recorded lines (the owner's own voice, made with ElevenLabs; trimmed of silence, levelled to
 * -18 LUFS, mono): each is said as its words come up on the page (ui/Overlay.tsx). Keyed by the
 * line's number in the script: 11 is the invitation (three lines, one recording), 15 the thoughts in
 * the car (four lines, one recording). Line 19 ("Time to get out of Drunkfurt.") has no recording.
 */
const urls = import.meta.glob('../assets/audio/voice/voice-*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const src = (n: string) => urls[`../assets/audio/voice/voice-${n}.mp3`];

export const VOICES = {
  '01': { src: src('01') },
  '02': { src: src('02') },
  '03': { src: src('03') },
  '04': { src: src('04') },
  '05': { src: src('05') },
  '06': { src: src('06') },
  '07': { src: src('07') },
  '08': { src: src('08') },
  '09': { src: src('09') },
  '10': { src: src('10') },
  '11': { src: src('11') },
  '14': { src: src('14') },
  '15': { src: src('15') },
  '20': { src: src('20') },
} satisfies Record<string, { src: string; gain?: number }>;

export type VoiceId = keyof typeof VOICES;

/** When each of the car's four lines starts in its recording (s), for the typing to keep pace with it. */
export const MONOLOGUE_LINES = [0, 2.5, 7.54, 9.72];
