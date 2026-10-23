import type { ReactNode } from 'react';
import { ARROW } from './fightArt';

/**
 * One action prompt panel (combatPrompt.ts drives it): PRESS [D] on the first
 * line, the action on the second (TO DEFEND, TO REV), placed and lettered as
 * in the design. The arrow stands over the first letter of the second line and
 * nudges inwards from there. The panel itself is pressable (touch screens have
 * no D); what a press does is the caller's (`onClick` for a tap, or pointer
 * handlers for a hold), and `children` may add a status line under it.
 */
export function PressPrompt({
  kind,
  action,
  on,
  label,
  children,
  ...handlers
}: {
  kind: 'defend' | 'rev';
  action: string;
  on: boolean;
  label: string;
  children?: ReactNode;
} & Pick<React.HTMLAttributes<HTMLButtonElement>, 'onClick' | 'onPointerDown' | 'onPointerUp' | 'onPointerCancel'>) {
  return (
    <button type="button" className={`fx-press fx-press--${kind}`} aria-hidden={!on} aria-label={label} tabIndex={on ? 0 : -1} {...handlers}>
      <span className="fx-row">
        <svg className="fx-arrow" viewBox={`0 0 ${ARROW.w} ${ARROW.h}`} aria-hidden>
          <path d={ARROW.d} fill="currentColor" />
        </svg>
        <span className="fx-press-d">
          <span className="fx-word" data-text="PRESS" />
          <span className="fx-key">
            <span className="fx-key-d" data-text="D" />
          </span>
        </span>
      </span>
      <span className="fx-word fx-action-word" data-text={action} />
      {children}
    </button>
  );
}
