/**
 * Fabric.js 5.3 + React — Comprehensive Type Definitions
 * ==============================================================================
 * Drop-in type foundation for the Photo Album Builder. Import this module to
 * eliminate `any` usage across the canvas builder codebase.
 *
 * @module fabric-types
 * @version 1.0.0
 */

/* ==============================================================================
 *  Branded primitive types
 * ============================================================================== */

/** Branded string that identifies a Fabric object ID. */
export type FabricObjectId = string & { readonly __brand: 'FabricObjectId' };

/** Branded string that identifies a photo asset. */
export type PhotoId = string & { readonly __brand: 'PhotoId' };

/** Branded string that identifies a text element. */
export type TextId = string & { readonly __brand: 'TextId' };

/** Branded string that identifies a background layer. */
export type BackgroundId = string & { readonly __brand: 'BackgroundId' };

/** Branded string that identifies a template slot. */
export type SlotId = string & { readonly __brand: 'SlotId' };

/* ==============================================================================
 *  Geometry types
 * ============================================================================== */

/** 2D point on the canvas (canvas or absolute coordinates). */
export interface Point {
  /** X coordinate in pixels. */
  x: number;
  /** Y coordinate in pixels. */
  y: number;
}

/** Rectangle bounds, used for object bounding boxes and viewport areas. */
export interface RectBounds {
  /** Left edge in pixels. */
  left: number;
  /** Top edge in pixels. */
  top: number;
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
}

/* ==============================================================================
 *  Custom property mixin
 * ============================================================================== */

/**
 * Custom properties attached to every Fabric object in the album builder.
 *
 * These properties are set at creation time and consumed by the builder logic
 * for selection, persistence, and template management. They are stored on the
 * object's prototype chain and serialized with `toObject()`.
 */
export interface AlbumCustomProperties {
  /** ID of the photo asset this object represents (for image objects). */
  photoId?: string;

  /** Zero-based index of the slot this object occupies in the current page. */
  slotIndex?: number;

  /** ID of the text element (for FabricText / FabricTextbox objects). */
  textId?: string;

  /** ID of the background layer this object belongs to. */
  bgId?: string;

  /** ID of the template slot this object is bound to. */
  slotId?: string;

  /**
   * When `true`, the object is a visual guide (e.g. alignment line) and should
   * not be persisted, exported, or included in user selection.
   */
  isGuide?: boolean;
}

/* ==============================================================================
 *  Core Fabric namespace types
 * ============================================================================== */

/**
 * Base Fabric object extended with the album builder's custom properties.
 *
 * This is the primary type for any object living on the canvas. Every
 * specialised object (image, text, rect, etc.) extends from this interface.
 */
export interface FabricObject extends AlbumCustomProperties {
  /** Unique identifier assigned by Fabric.js on instantiation. */
  id: string;

  /** Type discriminator — e.g. `'image'`, `'text'`, `'rect'`, `'circle'`. */
  type: string;

  /** Whether the object is included in the rendering pipeline. */
  visible: boolean;

  /** Whether the object can be selected by the user. */
  selectable: boolean;

  /** Whether the object can be moved via mouse / touch. */
  evented: boolean;

  /** Whether the object is currently selected on the canvas. */
  active: boolean;

  /** Opacity in the range `[0, 1]`. */
  opacity: number;

  /** Angle of rotation in degrees. */
  angle: number;

  /** Horizontal skew in degrees. */
  skewX: number;

  /** Vertical skew in degrees. */
  skewY: number;

  /** Horizontal flip flag. */
  flipX: boolean;

  /** Vertical flip flag. */
  flipY: boolean;

  /** X coordinate of the object's origin (top-left unless changed). */
  left: number;

  /** Y coordinate of the object's origin (top-left unless changed). */
  top: number;

  /** Object width in pixels. */
  width: number;

  /** Object height in pixels. */
  height: number;

  /** Horizontal scale factor. */
  scaleX: number;

  /** Vertical scale factor. */
  scaleY: number;

  /** Horizontal origin of transformation (`'left'`, `'center'`, `'right'`). */
  originX: 'left' | 'center' | 'right';

  /** Vertical origin of transformation (`'top'`, `'center'`, `'bottom'`). */
  originY: 'top' | 'center' | 'bottom';

  /** Padding around the object when rendered as active (selected). */
  padding: number;

  /** Color of the object's border when selected. */
  borderColor: string;

  /** Color of the corner controls when selected. */
  cornerColor: string;

  /** Size of the corner controls in pixels. */
  cornerSize: number;

  /** Whether corner controls are rendered as transparent. */
  transparentCorners: boolean;

  /** Whether the object has visible controls when selected. */
  hasControls: boolean;

  /** Whether the object can be rotated via the control handle. */
  hasRotatingPoint: boolean;

  /** Whether the object can be resized via controls. */
  hasBorders: boolean;

  /** z-index relative to sibling objects in the same container. */
  zIndex?: number;

  /** Shadow effect applied to this object. */
  shadow?: FabricShadow | string;

  /** Fill colour, gradient, or pattern applied to this object. */
  fill?: string | FabricGradient;

  /** Stroke colour. */
  stroke?: string;

  /** Stroke width in pixels. */
  strokeWidth?: number;

  /** Array of filters applied to image objects. */
  filters?: FabricFilter[];

  /** Optional object name for debugging / serialization. */
  name?: string;

  /** Optional data payload for application-specific metadata. */
  data?: Record<string, unknown>;

  // ------------------------------------------------------------------
  //  Core lifecycle methods
  // ------------------------------------------------------------------

  /** Returns a plain object representation suitable for JSON serialization. */
  toObject(propertiesToInclude?: string[]): Record<string, unknown>;

  /** Returns an SVG string representation of this object. */
  toSVG(reviver?: (svg: string) => string): string;

  /** Returns a data-URL of the object rendered standalone. */
  toDataURL(options?: DataUrlOptions): string;

  /** Completely removes the object from its parent canvas and disposes listeners. */
  dispose(): void;

  /** Mark the object as dirty, forcing a re-render on the next frame. */
  setDirty(): void;

  /** Mark the object's cache as invalid so it is regenerated. */
  dirty?: boolean;

  /** Bring the object one level forward in the stack. */
  bringForward(intersecting?: boolean): FabricObject;

  /** Send the object one level backward in the stack. */
  sendBackwards(intersecting?: boolean): FabricObject;

  /** Bring the object to the front of the stack. */
  bringToFront(): FabricObject;

  /** Send the object to the back of the stack. */
  sendToBack(): FabricObject;

  /** Return the current transform matrix as a 6-element array `[a, b, c, d, e, f]`. */
  calcTransformMatrix(skipGroup?: boolean): number[];

  /** Return the object's bounding rectangle relative to the canvas. */
  getBoundingRect(absolute?: boolean, calculate?: boolean): RectBounds;

  /** Set multiple properties in one call (shorthand for `set`). */
  set<K extends keyof this>(key: K, value: this[K]): this;
  set(props: Partial<this>): this;

  /** Get the value of a property. */
  get<K extends keyof this>(key: K): this[K];

  /** Toggle the object's visibility. */
  setVisible(visible: boolean): this;

  /** Return the rendered width including the effects of scaleX. */
  getScaledWidth(): number;

  /** Return the rendered height including the effects of scaleY. */
  getScaledHeight(): number;

  /** Clone this object asynchronously. */
  clone(callback: (clone: FabricObject) => void, propertiesToInclude?: string[]): void;

  /** Clone this object synchronously. */
  cloneSync(propertiesToInclude?: string[]): FabricObject;

  /** Called when the object is added to a canvas. */
  onAdded?(canvas: FabricCanvas): void;

  /** Called when the object is removed from a canvas. */
  onRemoved?(canvas: FabricCanvas): void;
}

/** Options passed to `toDataURL()`. */
export interface DataUrlOptions {
  /** Output image format — `'png'`, `'jpeg'`, `'webp'`. */
  format?: string;

  /** JPEG quality in range `[0, 1]`. */
  quality?: number;

  /** Multiplier for the output resolution (e.g. `2` for 2x). */
  multiplier?: number;

  /** Crop the output to these bounds. */
  left?: number;
  top?: number;
  width?: number;
  height?: number;

  /** Background colour to composite behind transparent areas. */
  backgroundColor?: string;

  /** Whether to enable the object's own shadow in the export. */
  enableRetinaScaling?: boolean;
}

/* ==============================================================================
 *  Specialised object types
 * ============================================================================== */

/** An image loaded from a URL, data-URL, or `<img>` element. */
export interface FabricImage extends FabricObject {
  type: 'image';

  /** Source URL of the image. */
  src: string;

  /** Original (unscaled) width of the image resource. */
  _elementWidth: number;

  /** Original (unscaled) height of the image resource. */
  _elementHeight: number;

  /** Cross-origin attribute for the underlying `<img>` element. */
  crossOrigin: string | null;

  /** Replaces the image source and re-renders. */
  setSrc(src: string, callback?: () => void, options?: Record<string, unknown>): FabricImage;

  /** Applies all queued filters to the image's internal `<canvas>` element. */
  applyFilters(callback?: () => void): void;
}

/** Single-line text rendered on the canvas. */
export interface FabricText extends FabricObject {
  type: 'text';

  /** The text string to render. */
  text: string;

  /** Font family — e.g. `'Arial'`, `'Georgia'`, `'Inter'`. */
  fontFamily: string;

  /** Font size in pixels. */
  fontSize: number;

  /** Font weight — e.g. `'normal'`, `'bold'`, `700`. */
  fontWeight: string | number;

  /** Font style — `'normal'`, `'italic'`, `'oblique'`. */
  fontStyle: string;

  /** Horizontal text alignment — `'left'`, `'center'`, `'right'`, `'justify'`. */
  textAlign: 'left' | 'center' | 'right' | 'justify';

  /** Line height multiplier (e.g. `1.2`). */
  lineHeight: number;

  /** Character spacing in pixels (may be fractional). */
  charSpacing: number;

  /** Text decoration — `'underline'`, `'overline'`, `'line-through'`, `''`. */
  textDecoration: string;

  /** Whether the text is editable on the canvas (Fabric 5.3 enhanced-text feature). */
  editable?: boolean;
}

/** Multi-line editable text box with automatic wrapping. */
export interface FabricTextbox extends FabricObject {
  type: 'textbox';

  /** The text string to render (supports `\n` for line breaks). */
  text: string;

  /** Font family — e.g. `'Arial'`, `'Georgia'`, `'Inter'`. */
  fontFamily: string;

  /** Font size in pixels. */
  fontSize: number;

  /** Font weight — e.g. `'normal'`, `'bold'`, `700`. */
  fontWeight: string | number;

  /** Font style — `'normal'`, `'italic'`, `'oblique'`. */
  fontStyle: string;

  /** Horizontal text alignment — `'left'`, `'center'`, `'right'`, `'justify'`, `'justify-left'`, `'justify-right'`, `'justify-center'`. */
  textAlign: 'left' | 'center' | 'right' | 'justify' | 'justify-left' | 'justify-right' | 'justify-center';

  /** Line height multiplier (e.g. `1.2`). */
  lineHeight: number;

  /** Character spacing in pixels. */
  charSpacing: number;

  /** Text decoration — `'underline'`, `'overline'`, `'line-through'`, `''`. */
  textDecoration: string;

  /** Whether the textbox is in editing mode. */
  isEditing: boolean;

  /** Maximum width of the textbox before wrapping (defaults to `width`). */
  maxWidth?: number;

  /** Minimum width the textbox can shrink to. */
  minWidth: number;

  /** Whether to dynamically resize height based on content. */
  dynamicMinWidth: number;

  /** Enters text editing mode on the canvas. */
  enterEditing(): void;

  /** Exits text editing mode and finalises the text. */
  exitEditing(): void;

  /** Inserts a new style object at the specified line index. */
  insertNewStyleBlock(insertedText: string, start: number, charStyle?: Record<string, unknown>): void;

  /** Sets selection styles for a range of characters. */
  setSelectionStyles(styles: Record<string, unknown>, startIndex?: number, endIndex?: number): void;
}

/** Axis-aligned rectangle. */
export interface FabricRect extends FabricObject {
  type: 'rect';

  /** Radius for rounded corners (all four corners). */
  rx: number;

  /** Radius for rounded corners (synonym for `rx` in Fabric 5.3). */
  ry: number;
}

/** Circle with equal width and height. */
export interface FabricCircle extends FabricObject {
  type: 'circle';

  /** Radius in pixels. */
  radius: number;

  /** Start angle of the arc in degrees (for pie-slice rendering). */
  startAngle: number;

  /** End angle of the arc in degrees. */
  endAngle: number;
}

/** Ellipse with independent x and y radii. */
export interface FabricEllipse extends FabricObject {
  type: 'ellipse';

  /** Horizontal radius in pixels. */
  rx: number;

  /** Vertical radius in pixels. */
  ry: number;
}

/** Simple two-point line. */
export interface FabricLine extends FabricObject {
  type: 'line';

  /** X coordinate of the line's start point. */
  x1: number;

  /** Y coordinate of the line's start point. */
  y1: number;

  /** X coordinate of the line's end point. */
  x2: number;

  /** Y coordinate of the line's end point. */
  y2: number;
}

/** SVG path rendered as a canvas shape. */
export interface FabricPath extends FabricObject {
  type: 'path';

  /** The SVG path data string — e.g. `'M 0 0 L 100 100'`. */
  path: Array<[string, ...number[]]> | string;

  /** Render the path with the specified fill rule. */
  pathOffset: Point;
}

/* ==============================================================================
 *  Gradient & Shadow
 * ============================================================================== */

/** A single colour stop inside a gradient. */
export interface GradientStop {
  /** Position along the gradient axis in the range `[0, 1]`. */
  offset: number;

  /** CSS colour string at this stop — e.g. `'#ff0000'`, `'rgba(0,0,0,0.5)'`. */
  color: string;
}

/** Gradient configuration for object fills or backgrounds. */
export interface FabricGradient {
  /** Type of gradient. */
  type: 'linear' | 'radial';

  /** Gradient coordinate system — `'pixels'` or `'percentage'`. */
  gradientUnits: 'pixels' | 'percentage';

  /** X coordinate of the gradient start point. */
  coords: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    r1?: number;
    r2?: number;
  };

  /** Ordered array of colour stops. */
  colorStops: GradientStop[];

  /** Offset applied to the gradient's transform matrix. */
  offsetX: number;

  /** Offset applied to the gradient's transform matrix. */
  offsetY: number;

  /** Gradient transform matrix (for rotated / skewed gradients). */
  gradientTransform?: number[];

  /** Converts the gradient to its SVG `<linearGradient>` or `<radialGradient>` representation. */
  toSVG(object: FabricObject): string;

  /** Serialises the gradient to a plain object. */
  toObject(): Record<string, unknown>;
}

/** Shadow effect applied to an object or text. */
export interface FabricShadow {
  /** Colour of the shadow — e.g. `'rgba(0,0,0,0.3)'`. */
  color: string;

  /** Horizontal offset in pixels. */
  blur: number;

  /** Horizontal offset in pixels. */
  offsetX: number;

  /** Vertical offset in pixels. */
  offsetY: number;

  /** Whether the shadow should affect the object's alpha channel. */
  affectStroke: boolean;

  /** Whether the shadow is non-trivial (has visible effect). */
  nonScaling: boolean;

  /** Serialises the shadow to an SVG `filter` string. */
  toSVG(object: FabricObject): string;

  /** Serialises the shadow to a plain object. */
  toObject(): Record<string, unknown>;
}

/* ==============================================================================
 *  Image filters
 * ============================================================================== */

/**
 * Base interface for all image filters.
 *
 * Filters are applied to `FabricImage.filters` and processed by
 * `FabricImage.applyFilters()`.
 */
export interface FabricFilter {
  /** Filter discriminator — e.g. `'Grayscale'`, `'Brightness'`. */
  type: string;

  /** Applies the filter to a WebGL or 2D canvas context. */
  applyTo(canvasEl: HTMLCanvasElement): void;

  /** Whether this filter uses the WebGL pipeline. */
  useByPoint?: boolean;

  /** Main parameter value (0-1) — varies by filter type. */
  mainParameter?: string;

  /** Serialises the filter to a plain object. */
  toObject(): Record<string, unknown>;
}

/** Converts the image to grayscale. */
export interface GrayscaleFilter extends FabricFilter {
  type: 'Grayscale';
}

/** Applies a warm sepia tone. */
export interface SepiaFilter extends FabricFilter {
  type: 'Sepia';
}

/** Adjusts image brightness. */
export interface BrightnessFilter extends FabricFilter {
  type: 'Brightness';
  /** Brightness delta in the range `[-1, 1]`. */
  brightness: number;
}

/** Adjusts image contrast. */
export interface ContrastFilter extends FabricFilter {
  type: 'Contrast';
  /** Contrast multiplier in the range `[0, 1]`. */
  contrast: number;
}

/** Adjusts colour saturation. */
export interface SaturationFilter extends FabricFilter {
  type: 'Saturation';
  /** Saturation multiplier in the range `[0, 1]`. */
  saturation: number;
}

/** Applies a Gaussian blur. */
export interface BlurFilter extends FabricFilter {
  type: 'Blur';
  /** Blur radius in pixels (non-negative). */
  blur: number;
}

/** Rotates the hue of all colours. */
export interface HueRotationFilter extends FabricFilter {
  type: 'HueRotation';
  /** Rotation in degrees in the range `[0, 360]`. */
  rotation: number;
}

/** Convenience union of all built-in photo filters. */
export type PhotoFilter =
  | GrayscaleFilter
  | SepiaFilter
  | BrightnessFilter
  | ContrastFilter
  | SaturationFilter
  | BlurFilter
  | HueRotationFilter;

/* ==============================================================================
 *  Event types
 * ============================================================================== */

/**
 * Emitted when the selection changes on the canvas.
 *
 * Fired on `selection:created`, `selection:updated`, and `selection:cleared`.
 */
export interface SelectionEvent {
  /** Objects that were just selected (empty on `selection:cleared`). */
  selected?: FabricObject[];

  /** Objects that were deselected in this event. */
  deselected?: FabricObject[];

  /** The primary target object of the selection change. */
  target?: FabricObject;
}

/**
 * Emitted for single-object lifecycle events.
 *
 * Fired on `object:added`, `object:removed`, `object:modified`, etc.
 */
export interface ObjectEvent {
  /** The Fabric object that is the subject of the event. */
  target: FabricObject;
}

/**
 * Emitted for mouse / pointer interactions on the canvas.
 *
 * Fired on `mouse:down`, `mouse:up`, `mouse:move`, `mouse:dblclick`,
 * `mouse:over`, `mouse:out`, etc.
 */
export interface MouseEvent {
  /** The Fabric object directly under the pointer (if any). */
  target?: FabricObject;

  /** Additional objects hit by the pointer (used with `perPixelTargetFind`). */
  subTargets?: FabricObject[];

  /** The underlying DOM event. */
  e: globalThis.Event;

  /** Pointer position in canvas coordinates. */
  pointer: Point;

  /** Pointer position in absolute (un-zoomed) canvas coordinates. */
  absolutePointer: Point;
}

/** Canvas drop event — extends the native DragEvent with canvas-local coordinates. */
export interface CanvasDropEvent extends MouseEvent {
  e: globalThis.DragEvent;
}

/** Generic Fabric canvas event map — used for typed event binding. */
export interface FabricEventMap {
  'selection:created': SelectionEvent;
  'selection:updated': SelectionEvent;
  'selection:cleared': SelectionEvent;
  'object:added': ObjectEvent;
  'object:removed': ObjectEvent;
  'object:modified': ObjectEvent;
  'object:rotating': ObjectEvent;
  'object:scaling': ObjectEvent;
  'object:moving': ObjectEvent;
  'object:skewing': ObjectEvent;
  'mouse:down': MouseEvent;
  'mouse:up': MouseEvent;
  'mouse:move': MouseEvent;
  'mouse:dblclick': MouseEvent;
  'mouse:over': MouseEvent;
  'mouse:out': MouseEvent;
  'mouse:wheel': MouseEvent & { e: WheelEvent };
  'drop': CanvasDropEvent;
  'dragover': CanvasDropEvent;
  'after:render': { ctx: CanvasRenderingContext2D };
  'before:render': { ctx: CanvasRenderingContext2D; finished: boolean };
}

/* ==============================================================================
 *  Canvas type
 * ============================================================================== */

/**
 * The Fabric.js Canvas instance.
 *
 * Wraps an HTML `<canvas>` element and manages the object tree, rendering
 * loop, event dispatch, and viewport transforms.
 */
export interface FabricCanvas {
  /** The lower-canvas HTML element managed by Fabric. */
  lowerCanvasEl: HTMLCanvasElement;

  /** The upper-canvas HTML element (event / overlay layer). */
  upperCanvasEl: HTMLCanvasElement;

  /** 2D rendering context of the lower canvas. */
  contextContainer: CanvasRenderingContext2D;

  /** Current background colour of the canvas. */
  backgroundColor: string | FabricGradient;

  /** Background image displayed behind all objects. */
  backgroundImage?: FabricImage;

  /** Overlay image displayed above all objects. */
  overlayImage?: FabricImage;

  /** Current zoom level (`1` = 100%). */
  getZoom(): number;

  /** Set the canvas zoom level with optional animation. */
  setZoom(value: number): void;

  /** Return the viewport transform matrix `[a, b, c, d, e, f]`. */
  viewportTransform: number[];

  /** Set the viewport transform matrix directly. */
  setViewportTransform(vpt: number[]): FabricCanvas;

  /** Absolute pan offset (in pixels) applied to the viewport. */
  absolutePan(point: Point): FabricCanvas;

  /** Relative pan offset added to the current viewport. */
  relativePan(point: Point): FabricCanvas;

  /** Return the current pan offset as a Point. */
  getCenter(): Point;

  /** Centre an object (or point) in the viewport. */
  centerObject(object: FabricObject): FabricCanvas;
  centerObjectH(object: FabricObject): FabricCanvas;
  centerObjectV(object: FabricObject): FabricCanvas;

  /** Width of the canvas element in pixels. */
  width: number;

  /** Height of the canvas element in pixels. */
  height: number;

  /** --------------------------------------------------------------- */
  /** Object collection                                               */
  /** --------------------------------------------------------------- */

  /** All objects currently on the canvas. */
  getObjects(): FabricObject[];

  /** Append an object to the top of the stack and render. */
  add(...objects: FabricObject[]): FabricCanvas;

  /** Remove an object from the canvas and render. */
  remove(...objects: FabricObject[]): FabricCanvas;

  /** Insert an object at a specific z-index position. */
  insertAt(object: FabricObject, index: number, nonSplicing?: boolean): FabricCanvas;

  /** Return the object at the specified index. */
  item(index: number): FabricObject;

  /** Return the number of objects on the canvas. */
  size(): number;

  /** Return `true` if the canvas contains the given object. */
  contains(object: FabricObject): boolean;

  /** Move an object to a specific index in the stack. */
  moveTo(object: FabricObject, index: number): FabricCanvas;

  /** Remove all objects from the canvas. */
  clear(): FabricCanvas;

  /** --------------------------------------------------------------- */
  /** Selection                                                       */
  /** --------------------------------------------------------------- */

  /** Currently active (selected) object or group. */
  getActiveObject(): FabricObject | null;

  /** All objects in the current selection. */
  getActiveObjects(): FabricObject[];

  /** Programmatically select an object. */
  setActiveObject(object: FabricObject, e?: globalThis.Event): FabricCanvas;

  /** Deselect the currently active object(s). */
  discardActiveObject(e?: globalThis.Event): FabricCanvas;

  /** Whether multi-selection is enabled. */
  selection: boolean;

  /** Whether objects can be selected. */
  selectable: boolean;

  /** Whether a selection box can be drawn by click-dragging on empty canvas space. */
  selectionKey: string | string[] | null;

  /** --------------------------------------------------------------- */
  /** Rendering                                                       */
  /** --------------------------------------------------------------- */

  /** Request a full re-render of the canvas on the next animation frame. */
  requestRenderAll(): FabricCanvas;

  /** Immediately render the entire canvas (synchronous). */
  renderAll(): FabricCanvas;

  /** Render only the canvas background layer. */
  renderTop(): FabricCanvas;

  /** Set the pixel width of the canvas element (does NOT change coordinate space). */
  setWidth(width: number): FabricCanvas;

  /** Set the pixel height of the canvas element (does NOT change coordinate space). */
  setHeight(height: number): FabricCanvas;

  /** Move the object to the top of the stack and render. */
  bringToFront(object: FabricObject): FabricCanvas;

  /** Move the object to the bottom of the stack and render. */
  sendToBack(object: FabricObject): FabricCanvas;

  /** Move the object one step forward in the stack. */
  bringForward(object: FabricObject): FabricCanvas;

  /** Move the object one step backward in the stack. */
  sendBackwards(object: FabricObject): FabricCanvas;

  /** Whether rendering is currently suspended. */
  renderOnAddRemove: boolean;

  /** --------------------------------------------------------------- */
  /** Serialization                                                   */
  /** --------------------------------------------------------------- */

  /** Export the entire canvas scene to a JSON-serialisable object. */
  toObject(propertiesToInclude?: string[]): Record<string, unknown>;

  /** Export the canvas to a JSON string. */
  toJSON(propertiesToInclude?: string[]): string;

  /** Return a data-URL of the entire canvas (objects + background). */
  toDataURL(options?: DataUrlOptions): string;

  /** Create an `<img>` element from the canvas contents. */
  toCanvasElement(multiplier?: number, cropping?: Partial<RectBounds>): HTMLCanvasElement;

  /** Load a full scene from a previously exported JSON object. */
  loadFromJSON(json: string | Record<string, unknown>, callback?: () => void, reviver?: (o: Record<string, unknown>, object: FabricObject, index: number) => void): FabricCanvas;

  /** --------------------------------------------------------------- */
  /** Hit testing                                                     */
  /** --------------------------------------------------------------- */

  /** Find the topmost object under the given point. */
  findTarget(pointer: Point, skipGroup?: boolean): FabricObject | undefined;

  /** Return all objects whose bounding box contains the point. */
  getObjectsAtPoint(x: number, y: number): FabricObject[];

  /** Convert a point from canvas coordinates to absolute coordinates. */
  restorePointerVpt(pointer: Point): Point;

  /** Convert absolute coordinates to canvas (viewport-transformed) coordinates. */
  restorePointerVptInverse(pointer: Point): Point;

  /** --------------------------------------------------------------- */
  /** Event binding (typed overloads)                                 */
  /** --------------------------------------------------------------- */

  on<K extends keyof FabricEventMap>(eventName: K, handler: (e: FabricEventMap[K]) => void): FabricCanvas;
  on(eventName: string, handler: (...args: unknown[]) => void): FabricCanvas;

  off<K extends keyof FabricEventMap>(eventName: K, handler?: (e: FabricEventMap[K]) => void): FabricCanvas;
  off(eventName?: string, handler?: (...args: unknown[]) => void): FabricCanvas;

  once<K extends keyof FabricEventMap>(eventName: K, handler: (e: FabricEventMap[K]) => void): FabricCanvas;
  once(eventName: string, handler: (...args: unknown[]) => void): FabricCanvas;

  /** Fire a custom event with typed payload. */
  fire<K extends keyof FabricEventMap>(eventName: K, options?: FabricEventMap[K]): FabricCanvas;
  fire(eventName: string, options?: Record<string, unknown>): FabricCanvas;

  /** --------------------------------------------------------------- */
  /** Cleanup                                                         */
  /** --------------------------------------------------------------- */

  /** Remove all event listeners, dispose the canvas element, and free memory. */
  dispose(): void;

  /** Whether the canvas has been disposed and should no longer be used. */
  disposer?: boolean;
}

/* ==============================================================================
 *  Photo filters (builder-specific)
 * ============================================================================== */

/**
 * Numeric filter values applied to photos in the album builder.
 *
 * Each value is in the range `[0, 1]` (or `[0, 360]` for `hueRotate`) and
 * represents the intensity of the corresponding CSS / canvas filter.
 */
export interface PhotoFilters {
  /** Grayscale intensity (`0` = full colour, `1` = black & white). */
  grayscale: number;

  /** Sepia tone intensity (`0` = none, `1` = full sepia). */
  sepia: number;

  /** Brightness adjustment (`0` = dark, `1` = normal, can exceed `1`). */
  brightness: number;

  /** Contrast adjustment (`0` = flat, `1` = normal, can exceed `1`). */
  contrast: number;

  /** Saturation multiplier (`0` = greyscale, `1` = normal, can exceed `1`). */
  saturate: number;

  /** Gaussian blur radius in pixels (non-negative). */
  blur: number;

  /** Hue rotation in degrees `[0, 360]`. */
  hueRotate: number;

  /** Opacity multiplier in the range `[0, 1]`. */
  opacity: number;
}

/* ==============================================================================
 *  Background types
 * ============================================================================== */

/** Background fill using a single solid colour. */
export interface SolidBackground {
  type: 'solid';

  /** CSS colour string — e.g. `'#ff0000'`, `'rgb(0, 128, 255)'`. */
  solid: string;
}

/** Background fill using a linear or radial gradient. */
export interface AlbumGradient {
  type: 'linear' | 'radial';

  /** Angle of the gradient in degrees (`0` = left-to-right). */
  angle: number;

  /** Ordered colour stops along the gradient axis. */
  stops: GradientStop[];
}

/** Background fill using a gradient definition. */
export interface GradientBackground {
  type: 'gradient';

  /** Gradient configuration. */
  gradient: AlbumGradient;
}

/** Background fill using a repeating material texture tile. */
export interface TextureBackground {
  type: 'texture';

  /** Material texture name (e.g. 'leather', 'linen') — see ./textures.ts. */
  texture: string;
}

/** Background fill using a full-bleed photo image. */
export interface ImageBackground {
  type: 'image';

  /** URL or data-URL of the background image. */
  image: string;

  /** Optional photo filters applied to the background image. */
  filters?: PhotoFilters;

  /** Opacity of the background image (`0`–`1`). */
  opacity?: number;

  /** X offset in pixels (defaults to `0`). */
  x?: number;

  /** Y offset in pixels (defaults to `0`). */
  y?: number;

  /** Rendered width in pixels (defaults to canvas width). */
  width?: number;

  /** Rendered height in pixels (defaults to canvas height). */
  height?: number;

  /** Rotation in degrees (defaults to `0`). */
  rotation?: number;
}

/**
 * Discriminated union of all album background types.
 *
 * Use the `type` property to narrow:
 *
 * ```ts
 * if (bg.type === 'gradient') {
 *   console.log(bg.gradient.angle);
 * }
 * ```
 */
export type AlbumBackground =
  | SolidBackground
  | GradientBackground
  | TextureBackground
  | ImageBackground;

/* ==============================================================================
 *  Page / Template / Slot types
 * ============================================================================== */

/**
 * A single photo slot inside a page template.
 *
 * Slots define where photos are placed on a page. The builder creates a
 * `FabricImage` (or clip-path mask) for each slot and binds it via `slotIndex`.
 */
export interface TemplateSlot {
  /** X position of the slot's top-left corner in page coordinates. */
  x: number;

  /** Y position of the slot's top-left corner in page coordinates. */
  y: number;

  /** Slot width in pixels. */
  width: number;

  /** Slot height in pixels. */
  height: number;

  /**
   * Clip shape applied to the photo.
   *
   * - `'rectangle'` — default axis-aligned rectangle
   * - `'circle'` — circular mask
   * - `'rounded'` — rectangle with rounded corners (`borderRadius`)
   * - `'oval'` — elliptical mask
   * - `'heart'` — heart-shaped clip path
   */
  shape?: 'rectangle' | 'circle' | 'rounded' | 'oval' | 'heart';

  /** Corner radius in pixels when `shape === 'rounded'`. */
  borderRadius?: number;

  /** Rotation applied to the slot in degrees. */
  rotation?: number;
}

/**
 * A reusable page template containing a pre-defined arrangement of photo slots.
 */
export interface PageTemplate {
  /** Unique template identifier. */
  id: string;

  /** Human-readable template name (displayed in the template picker). */
  name: string;

  /** Template category for grouping — e.g. `'grid'`, `'collage'`, `'masonry'`. */
  category: string;

  /** Ordered array of photo slots that make up this layout. */
  slots: TemplateSlot[];

  /** Total number of slots (denormalised for quick UI reference). */
  slotCount: number;
}

/**
 * An instantiated page in the album.
 *
 * A page owns a background, a template, and an array of photo objects that
 * have been placed into the template's slots.
 */
export interface AlbumPage {
  /** Page identifier (unique within the album). */
  id: string;

  /** Zero-based page number. */
  pageNumber: number;

  /** Background applied to this page. */
  background: AlbumBackground;

  /** Template used to layout this page. */
  template: PageTemplate;

  /** Photos placed into each slot (sparse — empty slots are `undefined`). */
  photos: Array<FabricImage | undefined>;
}

/* ==============================================================================
 *  FabricStatic — the imported `fabric` module
 * ============================================================================== */

/**
 * The Fabric.js static module exported by `import fabric from 'fabric'`
 * (or `import * as fabric from 'fabric'`).
 *
 * Holds constructors for all classes, utility functions, and version info.
 */
export interface FabricStatic {
  /** Fabric.js version string — e.g. `'5.3.0'`. */
  version: string;

  /** Whether the current environment supports `toDataURL` on canvas elements. */
  isLikelyNode: boolean;

  /** Whether touch events are supported. */
  isTouchSupported: boolean;

  // ------------------------------------------------------------------
  //  Canvas constructor
  // ------------------------------------------------------------------

  /**
   * Create a new Fabric canvas.
   *
   * @param element — CSS selector string, `<canvas>` element, or element id.
   * @param options — Optional canvas configuration (width, height, backgroundColor, etc.).
   */
  Canvas: new (element: string | HTMLCanvasElement, options?: Partial<FabricCanvas>) => FabricCanvas;
  StaticCanvas: new (element: string | HTMLCanvasElement, options?: Partial<FabricCanvas>) => FabricCanvas;

  // ------------------------------------------------------------------
  //  Object constructors
  // ------------------------------------------------------------------

  Object: new (...args: unknown[]) => FabricObject;
  Image: {
    new (element?: HTMLImageElement | HTMLCanvasElement, options?: Partial<FabricImage>): FabricImage;
    /** Async factory — loads an image from a URL and wraps it in a FabricImage. */
    fromURL(url: string, callback: (img: FabricImage) => void, options?: Partial<FabricImage> & { crossOrigin?: string }): void;
    /** Create a FabricImage from an HTMLImageElement. */
    fromElement(element: HTMLImageElement, callback: (img: FabricImage) => void, options?: Partial<FabricImage>): void;
  };
  Text: new (text: string, options?: Partial<FabricText>) => FabricText;
  Textbox: new (text: string, options?: Partial<FabricTextbox>) => FabricTextbox;
  Rect: new (options?: Partial<FabricRect>) => FabricRect;
  Circle: new (options?: Partial<FabricCircle>) => FabricCircle;
  Ellipse: new (options?: Partial<FabricEllipse>) => FabricEllipse;
  Line: new (points: [number, number, number, number], options?: Partial<FabricLine>) => FabricLine;
  Path: new (path: string | Array<[string, ...number[]]>, options?: Partial<FabricPath>) => FabricPath;
  Gradient: new (options?: Partial<FabricGradient>) => FabricGradient;
  Shadow: new (options?: Partial<FabricShadow> | string) => FabricShadow;
  Group: new (objects: FabricObject[], options?: Partial<FabricObject>, isAlreadyGrouped?: boolean) => FabricObject;

  // ------------------------------------------------------------------
  //  Filter constructors
  // ------------------------------------------------------------------

  filters: {
    Grayscale: new (options?: { mode?: 'average' | 'lightness' | 'luminosity' }) => GrayscaleFilter;
    Sepia: new () => SepiaFilter;
    Brightness: new (options?: { brightness?: number }) => BrightnessFilter;
    Contrast: new (options?: { contrast?: number }) => ContrastFilter;
    Saturation: new (options?: { saturation?: number }) => SaturationFilter;
    Blur: new (options?: { blur?: number }) => BlurFilter;
    HueRotation: new (options?: { rotation?: number }) => HueRotationFilter;
  };

  // ------------------------------------------------------------------
  //  Utility functions
  // ------------------------------------------------------------------

  /** Create a point with the given coordinates. */
  Point: new (x: number, y: number) => Point;

  /** Utility for matrix / vector math. */
  util: {
    /** Remove an item from an array by reference equality. */
    removeFromArray<T>(array: T[], value: T): T[];

    /** Transform a point by a 6-element matrix. */
    transformPoint(point: Point, matrix: number[], ignoreOffset?: boolean): Point;

    /** Invert a 6-element transform matrix. */
    invertTransform(t: number[]): number[];

    /** Multiply two 6-element transform matrices. */
    multiplyTransformMatrices(a: number[], b: number[], is2x2?: boolean): number[];

    /** Return a new identity matrix `[1, 0, 0, 1, 0, 0]`. */
    createMatrix(): number[];

    /** Rotate a point around an origin by a given angle in radians. */
    rotatePoint(point: Point, origin: Point, radians: number): Point;

    /** Request an animation frame (polyfilled for older browsers). */
    requestAnimFrame(callback: FrameRequestCallback): number;

    /** Load an image asynchronously. */
    loadImage(url: string, callback: (img: HTMLImageElement | null) => void, context?: unknown, crossOrigin?: string): void;

    /** Parse a CSS font string into its component parts. */
    parseFontDeclaration(value: string, oStyle: Record<string, unknown>): void;

    /** Enliven (rehydrate) plain objects into full Fabric instances. */
    enlivenObjects(objects: unknown[], callback?: (enlivened: FabricObject[]) => void, reviver?: FabricObjectReviver, options?: unknown): Promise<FabricObject[]>;

    /** Enliven a pattern or gradient object. */
    enlivenPatterns(patterns: unknown[], callback?: (enlivened: unknown[]) => void): Promise<unknown[]>;
  };

  /**
   * Run code after the DOM is ready (or immediately if already ready).
   *
   * In Node.js environments this executes synchronously.
   */
  $(callback: () => void): void;
}

/** Callback signature for the `reviver` parameter in `enlivenObjects`. */
export type FabricObjectReviver = (o: Record<string, unknown>, instance: FabricObject, index: number) => void;

/* ==============================================================================
 *  Builder utility functions
 * ============================================================================== */

/**
 * Convert a `PhotoFilters` record into an array of Fabric filter instances.
 *
 * @param fab    — The Fabric.js static module (provides filter constructors).
 * @param filters — Numeric filter values from the builder state.
 * @returns      An array of filter instances ready to be assigned to
 *               `FabricImage.filters` and applied with `applyFilters()`.
 *
 * @example
 * ```ts
 * const img = new fab.Image(element);
 * img.filters = buildFabricFilters(fab, { grayscale: 1, brightness: 1.2 });
 * img.applyFilters();
 * canvas.requestRenderAll();
 * ```
 */
export declare function buildFabricFilters(fab: FabricStatic, filters: PhotoFilters): FabricFilter[];

/**
 * Convert a `PhotoFilters` record into a CSS `filter` string.
 *
 * Use this when exporting album pages to CSS-styled HTML or when applying
 * the same filter stack via CSS instead of canvas.
 *
 * @param filters — Numeric filter values from the builder state.
 * @returns       A CSS `filter` property value — e.g.
 *                `'grayscale(1) brightness(1.2) blur(2px)'`.
 *
 * @example
 * ```ts
 * const css = filtersToCSS({ grayscale: 0.5, sepia: 0.2, blur: 3 });
 * // → 'grayscale(50%) sepia(20%) blur(3px) ...'
 * previewElement.style.filter = css;
 * ```
 */
export declare function filtersToCSS(filters: PhotoFilters): string;

/* ==============================================================================
 *  React-specific bridge types
 * ============================================================================== */

/**
 * Props accepted by the `<FabricCanvas>` React component wrapper.
 *
 * The wrapper manages the lifecycle of the underlying `FabricCanvas` instance
 * and exposes imperative handles for parent components.
 */
export interface FabricCanvasProps {
  /** CSS class applied to the wrapper `<div>`. */
  className?: string;

  /** Inline styles applied to the wrapper `<div>`. */
  style?: import('react').CSSProperties;

  /** Initial canvas width in pixels. */
  width?: number;

  /** Initial canvas height in pixels. */
  height?: number;

  /** Background colour or gradient applied on mount. */
  backgroundColor?: string | FabricGradient;

  /** Whether to render the canvas at device-pixel-ratio resolution. */
  enableRetinaScaling?: boolean;

  /** Whether to preserve object stacking order during selection. */
  preserveObjectStacking?: boolean;

  /** Whether objects outside the visible area should be rendered. */
  renderOnAddRemove?: boolean;

  /** Whether the canvas is interactive (mouse / touch events). */
  interactive?: boolean;

  /** Whether to fire per-pixel hit testing for complex shapes. */
  perPixelTargetFind?: boolean;

  /** Called with the FabricCanvas instance once it is ready. */
  onReady?: (canvas: FabricCanvas) => void;

  /** Typed event handlers that are automatically bound / cleaned up. */
  onSelectionCreated?: (e: SelectionEvent) => void;
  onSelectionUpdated?: (e: SelectionEvent) => void;
  onSelectionCleared?: (e: SelectionEvent) => void;
  onObjectAdded?: (e: ObjectEvent) => void;
  onObjectRemoved?: (e: ObjectEvent) => void;
  onObjectModified?: (e: ObjectEvent) => void;
  onMouseDown?: (e: MouseEvent) => void;
  onMouseUp?: (e: MouseEvent) => void;
  onMouseMove?: (e: MouseEvent) => void;
  onMouseWheel?: (e: MouseEvent & { e: WheelEvent }) => void;
  onDrop?: (e: CanvasDropEvent) => void;
  onAfterRender?: (e: { ctx: CanvasRenderingContext2D }) => void;
}

/**
 * Imperative handle exposed by the `<FabricCanvas>` React component via `useImperativeHandle`.
 *
 * Parent components can use this ref to access the canvas instance directly
 * without prop-drilling:
 *
 * ```ts
 * const canvasRef = useRef<FabricCanvasHandle>(null);
 * canvasRef.current?.getCanvas(); // → FabricCanvas | null
 * canvasRef.current?.zoomTo(1.5);
 * ```
 */
export interface FabricCanvasHandle {
  /** Return the underlying FabricCanvas instance (or `null` if not yet mounted). */
  getCanvas(): FabricCanvas | null;

  /** Programmatic zoom with optional animated transition. */
  zoomTo(level: number, options?: { animate?: boolean; duration?: number }): void;

  /** Pan the viewport so the given point is centred. */
  panTo(point: Point): void;

  /** Reset zoom to `1` and pan to origin. */
  resetViewport(): void;

  /** Export the current page as a PNG data-URL. */
  exportAsPNG(options?: DataUrlOptions): string;
}

/* ==============================================================================
 *  Module augmentation for fabric imports
 * ============================================================================== */

/**
 * Usage example for consuming files:
 *
 * ```ts
 * // BEFORE (untyped):
 * import fabric from './fabric-loader';
 * const canvas = new fabric.Canvas('c');  // canvas: any
 *
 * // AFTER (fully typed):
 * import type { FabricStatic, FabricCanvas, FabricObject } from './fabric-types';
 * import fabric from './fabric-loader';
 *
 * const canvas: FabricCanvas = new fabric.Canvas('c');
 * const rect: FabricObject = new fabric.Rect({ width: 100, height: 100 });
 * canvas.add(rect);
 * ```
 *
 * For even tighter integration, create a typed loader wrapper:
 *
 * ```ts
 * // fabric-loader.ts
 * import fabric from 'fabric';
 * import type { FabricStatic } from './fabric-types';
 * export default fabric as unknown as FabricStatic;
 * export type { FabricStatic, FabricCanvas, FabricObject, FabricImage };
 * ```
 */

/* ==============================================================================
 *  Re-export convenience
 * ============================================================================== */

/**
 * Convenience type guard — check whether an object is a FabricImage.
 *
 * @param obj — Any FabricObject.
 * @returns   `true` if the object's `type` is `'image'`.
 */
export function isFabricImage(obj: FabricObject): obj is FabricImage {
  return obj.type === 'image';
}

/**
 * Convenience type guard — check whether an object is a FabricText.
 */
export function isFabricText(obj: FabricObject): obj is FabricText {
  return obj.type === 'text';
}

/**
 * Convenience type guard — check whether an object is a FabricTextbox.
 */
export function isFabricTextbox(obj: FabricObject): obj is FabricTextbox {
  return obj.type === 'textbox';
}

/**
 * Convenience type guard — check whether an object is a guide line.
 *
 * Guide objects are ephemeral and should be excluded from export / persistence.
 */
export function isGuideObject(obj: FabricObject): boolean {
  return obj.isGuide === true;
}
