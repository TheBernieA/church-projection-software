import type { TransitionSpec } from '@lampstand/core';

/** Enter/exit keyframes per transition kind. Opacity/transform/filter only — never layout props. */
export function transitionFrames(kind: TransitionSpec['kind']): {
  enter: Keyframe[];
  exit: Keyframe[];
} {
  switch (kind) {
    case 'slide':
      return {
        enter: [
          { opacity: 0, transform: 'translateY(40px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        exit: [
          { opacity: 1, transform: 'translateY(0)' },
          { opacity: 0, transform: 'translateY(-40px)' },
        ],
      };
    case 'zoom':
      return {
        enter: [
          { opacity: 0, transform: 'scale(0.96)' },
          { opacity: 1, transform: 'scale(1)' },
        ],
        exit: [
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(1.04)' },
        ],
      };
    case 'blur':
      return {
        enter: [
          { opacity: 0, filter: 'blur(12px)' },
          { opacity: 1, filter: 'blur(0px)' },
        ],
        exit: [
          { opacity: 1, filter: 'blur(0px)' },
          { opacity: 0, filter: 'blur(12px)' },
        ],
      };
    case 'cut':
    case 'fade':
    case 'dissolve':
      return { enter: [{ opacity: 0 }, { opacity: 1 }], exit: [{ opacity: 1 }, { opacity: 0 }] };
  }
}
