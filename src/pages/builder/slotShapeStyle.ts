import type { TemplateSlot } from './types';
import { archPath, starPolygonCss, featherEdgeCss, isPathShape, maskPathD, type FeatherSide } from './masks';

/** Compute shape-corrected sizing and CSS style for a template slot.
 *  Returns the style object plus adjusted width/height and offsets so
 *  circles stay circular and special shapes are centered properly. */
export function slotShapeStyle(
  slot: TemplateSlot & { feather?: number; featherSide?: FeatherSide },
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

  // Path shapes come from the ONE generator every renderer uses.
  if (isPathShape(shape)) {
    return {
      style: { clipPath: `path("${maskPathD(shape, 0, 0, rawWidth, rawHeight)}")` },
      width: rawWidth, height: rawHeight, leftOffset: 0, topOffset: 0,
    };
  }

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

    case 'arch': {
      return {
        style: { clipPath: `path("${archPath(rawWidth, rawHeight)}")` },
        width: rawWidth,
        height: rawHeight,
        leftOffset: 0,
        topOffset: 0,
      };
    }

    case 'star': {
      const size = Math.min(rawWidth, rawHeight);
      return {
        style: {
          // The SAME star as the print + Fabric renderers (masks.ts).
          clipPath: starPolygonCss(),
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
      // Rectangle — no shape adjustment. A soft-edge mask feathers it.
      return {
        style: {
          borderRadius: borderRadius ? `${borderRadius}px` : undefined,
          clipPath: undefined,
          ...(slot.feather ? featherEdgeCss(slot.feather, rawWidth, rawHeight, slot.featherSide) : {}),
        },
        width: rawWidth,
        height: rawHeight,
        leftOffset: 0,
        topOffset: 0,
      };
    }
  }
}
