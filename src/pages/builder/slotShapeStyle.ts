import type { TemplateSlot } from './types';

/** Compute shape-corrected sizing and CSS style for a template slot.
 *  Returns the style object plus adjusted width/height and offsets so
 *  circles stay circular and special shapes are centered properly. */
export function slotShapeStyle(
  slot: TemplateSlot,
  rawWidth: number,
  rawHeight: number,
): {
  style: React.CSSProperties;
  width: number;
  height: number;
  leftOffset: number;
  topOffset: number;
} {
  const shape = slot.shape;
  const borderRadius = slot.borderRadius;

  switch (shape) {
    case 'circle': {
      // Circle must be square — use the smaller dimension
      const size = Math.min(rawWidth, rawHeight);
      return {
        style: {
          borderRadius: '50%',
          clipPath: undefined,
        },
        width: size,
        height: size,
        leftOffset: (rawWidth - size) / 2,
        topOffset: (rawHeight - size) / 2,
      };
    }

    case 'oval': {
      return {
        style: {
          borderRadius: '50%',
          clipPath: undefined,
        },
        width: rawWidth,
        height: rawHeight,
        leftOffset: 0,
        topOffset: 0,
      };
    }

    case 'heart': {
      // Heart needs square-ish area for the clip-path
      const size = Math.min(rawWidth, rawHeight);
      return {
        style: {
          clipPath: 'path("M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z")',
          clipPathUnits: 'objectBoundingBox',
        } as React.CSSProperties,
        width: size,
        height: size,
        leftOffset: (rawWidth - size) / 2,
        topOffset: (rawHeight - size) / 2,
      };
    }

    case 'star': {
      const size = Math.min(rawWidth, rawHeight);
      return {
        style: {
          clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
        },
        width: size,
        height: size,
        leftOffset: (rawWidth - size) / 2,
        topOffset: (rawHeight - size) / 2,
      };
    }

    case 'rounded': {
      return {
        style: {
          borderRadius: borderRadius ? `${borderRadius}px` : '12px',
          clipPath: undefined,
        },
        width: rawWidth,
        height: rawHeight,
        leftOffset: 0,
        topOffset: 0,
      };
    }

    default: {
      // Rectangle — no shape adjustment
      return {
        style: {
          borderRadius: borderRadius ? `${borderRadius}px` : undefined,
          clipPath: undefined,
        },
        width: rawWidth,
        height: rawHeight,
        leftOffset: 0,
        topOffset: 0,
      };
    }
  }
}
