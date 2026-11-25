import type { CameraView } from './schemas/camera';

/**
 * Camera follow: keeping a person framed the way a broadcast camera operator would. Pure (no
 * camera, no clock of its own), so it's tested on made-up people and times.
 *
 * Everything is in fractions of the camera's picture, origin top left. A person comes from body
 * landmarks (MediaPipe's pose model in the control window); `PersonLock` keeps to the same person
 * from frame to frame; then either `DigitalFollow` (a crop inside the picture: any camera) or
 * `PtzFollow` (pan, tilt and zoom speeds for a real PTZ camera) frames them.
 *
 * The framing rules (eye line, size, lead room, dead zones) follow Churchfront Video's
 * (Apache-2.0): eyes near the upper third, edges between joints, room on the side the person
 * faces or walks toward, and a dead zone so small moves don't move the shot.
 */

export interface FramePoint {
  x: number;
  y: number;
}
export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ShotSize = 'close' | 'waist' | 'full';
export const SHOT_SIZES: readonly ShotSize[] = ['close', 'waist', 'full'];

export interface FramingRule {
  /** Where the eyes sit, down from the top of the frame (0–1). */
  eyeLine: number;
  /** Eyes to shoulders, as a share of the frame's height: how big the person is. */
  scale: number;
  /** How far off centre a person facing or walking one way sits (share of frame width). */
  leadRoom: number;
  /** How far they drift across, or up and down, before the shot moves (share of the frame). */
  deadX: number;
  deadY: number;
}

export const FRAMING: Record<ShotSize, FramingRule> = {
  close: { eyeLine: 0.29, scale: 0.36, leadRoom: 0.09, deadX: 0.08, deadY: 0.05 },
  waist: { eyeLine: 0.29, scale: 0.21, leadRoom: 0.11, deadX: 0.07, deadY: 0.05 },
  full: { eyeLine: 0.12, scale: 0.097, leadRoom: 0.13, deadX: 0.06, deadY: 0.04 },
};

/** One person in a picture. */
export interface Person {
  /** All of them that's in view (for the outline, and clicking on them). */
  box: FrameRect;
  /** Head and torso: where they are, whatever their arms do. */
  core: FrameRect;
  /** Between the eyes (or the nose). */
  eye: FramePoint;
  /** Eyes to shoulders as a share of the picture's height (null: not clear enough). */
  shoulder: number | null;
  /** Which way they face: −1 left, 1 right (in the picture), 0 toward the camera. */
  facing: -1 | 0 | 1;
}

/** A landmark as MediaPipe's pose model gives it (x, y in 0–1 of the picture). */
export interface Landmark {
  x: number;
  y: number;
  visibility?: number;
}

/** MediaPipe pose landmark numbers. */
const NOSE = 0;
const EYES = [2, 5] as const;
const SHOULDERS = [11, 12] as const;
const HIPS = [23, 24] as const;
const SEEN = 0.5;

const seen = (l: Landmark | undefined): l is Landmark =>
  !!l && (l.visibility ?? 1) >= SEEN && l.x >= -0.05 && l.x <= 1.05 && l.y >= -0.05 && l.y <= 1.05;
const mid = (a: Landmark | undefined, b: Landmark | undefined): FramePoint | null =>
  seen(a) && seen(b)
    ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    : seen(a)
      ? a
      : seen(b)
        ? b
        : null;

function bounds(points: FramePoint[]): FrameRect | null {
  if (points.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** A person from one pose's landmarks (null: not enough of them seen). */
export function personFromLandmarks(l: readonly Landmark[]): Person | null {
  const eye = mid(l[EYES[0]], l[EYES[1]]) ?? (seen(l[NOSE]) ? l[NOSE] : null);
  const shoulders = mid(l[SHOULDERS[0]], l[SHOULDERS[1]]);
  if (!eye || !shoulders) return null;
  // Upright, as people on a stage are: eyes above the shoulders, shoulders above the hips. At
  // the low confidence the detector runs at, it also "finds" shapes in a car's wheel or a
  // patterned floor; those come out upside down or folded, and are dropped here (measured).
  if (shoulders.y - eye.y < 0.01) return null;
  const hips = mid(l[HIPS[0]], l[HIPS[1]]);
  if (hips && hips.y - shoulders.y < 0.02) return null;
  const visible = l.filter(seen);
  const box = bounds(visible);
  const core = bounds(
    [NOSE, ...EYES, ...SHOULDERS, ...HIPS].map((i) => l[i]).filter((p): p is Landmark => seen(p)),
  );
  if (!box || !core) return null;
  // Facing: the nose sits toward the side they face, against the shoulders' middle.
  const nose = l[NOSE];
  const width = Math.abs((l[SHOULDERS[0]]?.x ?? 0) - (l[SHOULDERS[1]]?.x ?? 0)) || 0.05;
  const turn = seen(nose) ? (nose.x - shoulders.x) / width : 0;
  const facing = turn > 0.25 ? 1 : turn < -0.25 ? -1 : 0;
  const both = seen(l[SHOULDERS[0]]) && seen(l[SHOULDERS[1]]);
  const shoulder = both ? Math.abs(shoulders.y - eye.y) : null;
  return {
    box,
    core,
    eye: { x: eye.x, y: eye.y },
    shoulder: shoulder && shoulder > 0.005 ? shoulder : null,
    facing,
  };
}

const centre = (r: FrameRect): FramePoint => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const contains = (r: FrameRect, p: FramePoint, pad = 0.02): boolean =>
  p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;

/** Gone this long: "lost them, looking". */
export const LOST_MS = 500;

/**
 * Keeps to one person from frame to frame: whoever is nearest where they were (scaled by their
 * size, so a far-away person counts small moves as big), never jumping to someone across the
 * stage. After losing sight it waits for someone near where they were last.
 */
export class PersonLock {
  private last: Person | null = null;
  private lastSeen = -Infinity;

  /** Start on the person at `at` (a click), or the one nearest the middle. */
  start(people: readonly Person[], at?: FramePoint): Person | null {
    const pick = at
      ? (people.find((p) => contains(p.box, at)) ?? nearest(people, at))
      : nearest(people, { x: 0.5, y: 0.45 });
    this.last = pick;
    this.lastSeen = pick ? -Infinity : -Infinity;
    return pick;
  }

  get following(): Person | null {
    return this.last;
  }

  /** This frame's person (null: not in view now). */
  next(people: readonly Person[], now: number): Person | null {
    if (!this.last) return null;
    if (this.lastSeen === -Infinity) this.lastSeen = now;
    const was = centre(this.last.core);
    const size = Math.max(0.04, this.last.core.h);
    let best: Person | null = null;
    let bestD = Infinity;
    for (const p of people) {
      const c = centre(p.core);
      // Distance in body heights: a step for someone near is a lot of picture.
      const d = Math.hypot(c.x - was.x, c.y - was.y) / size;
      const grew = p.core.h / size;
      if (d < bestD && grew > 0.5 && grew < 2) {
        best = p;
        bestD = d;
      }
    }
    // Frame to frame (~12 a second) someone walking moves far less than the gap to the person
    // beside them: half a body height, widening only while they're out of sight. (At 1.2 it
    // was measured drifting onto a neighbour standing beside them.)
    const reach = 0.5 + ((now - this.lastSeen) / 1000) * 1.5;
    if (best && bestD <= reach) {
      this.last = best;
      this.lastSeen = now;
      return best;
    }
    return null;
  }

  /** Not seen for a while. */
  lost(now: number): boolean {
    return this.last !== null && this.lastSeen !== -Infinity && now - this.lastSeen > LOST_MS;
  }
}

function nearest(people: readonly Person[], at: FramePoint): Person | null {
  let best: Person | null = null;
  let bestD = Infinity;
  for (const p of people) {
    const c = centre(p.core);
    const d = Math.hypot(c.x - at.x, c.y - at.y);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

export const WHOLE: CameraView = { x: 0.5, y: 0.5, zoom: 1 };

/** A view kept inside the picture (no black edges). */
export function clampView(v: CameraView, maxZoom: number): CameraView {
  const zoom = Math.min(maxZoom, Math.max(1, v.zoom));
  const half = 0.5 / zoom;
  return {
    x: Math.min(1 - half, Math.max(half, v.x)),
    y: Math.min(1 - half, Math.max(half, v.y)),
    zoom,
  };
}

/** Lead room toward where they face: a little; toward where they walk: the rule's full amount. */
function leadFor(person: Person, walking: number, rule: FramingRule): number {
  if (walking !== 0) return walking * rule.leadRoom;
  return person.facing * rule.leadRoom * 0.35;
}

/**
 * The view that frames this person at this size: eyes on the eye line, sized by eyes to
 * shoulders, lead room on the side they face or walk toward.
 */
export function frameFor(
  person: Person,
  size: ShotSize,
  maxZoom: number,
  walking: -1 | 0 | 1 = 0,
  holdZoom?: number,
): CameraView {
  const rule = FRAMING[size];
  const zoom =
    holdZoom ??
    (person.shoulder !== null
      ? rule.scale / person.shoulder
      : // No shoulders: frame the whole of what's seen (a full shot).
        0.8 / Math.max(0.1, person.box.h));
  const z = Math.min(maxZoom, Math.max(1, zoom));
  const h = 1 / z;
  return clampView(
    {
      // The frame's middle sits away from the eyes by the lead room (they look into space).
      x: person.eye.x + leadFor(person, walking, rule) * h,
      y: person.eye.y - rule.eyeLine * h + h / 2,
      zoom: z,
    },
    maxZoom,
  );
}

/** Faster than this across the picture (share of its width a second), held a while: walking. */
const WALK_SPEED = 0.08;
const WALK_HOLD_MS = 800;

/**
 * Which way someone is walking: a steady speed one way for most of a second (a sway, a step
 * back and forth or a gesture isn't walking, and mustn't swing the lead room).
 */
class WalkSense {
  private lastX: number | null = null;
  private lastAt = 0;
  private vx = 0;
  private dir: -1 | 0 | 1 = 0;
  private since: number | null = null;

  next(x: number | null, now: number): -1 | 0 | 1 {
    if (x === null) {
      this.lastX = null;
      this.since = null;
      this.dir = 0;
      return 0;
    }
    if (this.lastX !== null) {
      const dt = Math.max(0.001, (now - this.lastAt) / 1000);
      this.vx = glide(this.vx, (x - this.lastX) / dt, dt, 0.5);
    }
    this.lastX = x;
    this.lastAt = now;
    const way = this.vx > WALK_SPEED ? 1 : this.vx < -WALK_SPEED ? -1 : 0;
    if (way === 0) {
      this.since = null;
      this.dir = 0;
    } else if (way !== this.dir) {
      this.since ??= now;
      if (now - this.since >= WALK_HOLD_MS) this.dir = way;
    }
    return this.dir;
  }
}

/** Glide toward a value: `tau` seconds to cover about 63 % of the way. */
const glide = (from: number, to: number, dt: number, tau: number): number =>
  from + (to - from) * (1 - Math.exp(-dt / tau));

/**
 * Digital follow: a crop that keeps someone framed inside a camera's picture. The frame only
 * moves once they leave the dead zone, then glides (quicker near the frame's edge) until they're
 * back on their mark; the zoom changes only when the size has been wrong for a while, slowly.
 */
export class DigitalFollow {
  private view: CameraView;
  private moving = { x: false, y: false };
  private readonly walk = new WalkSense();
  private zoomWrongSince: number | null = null;
  private zooming = false;
  private targetZoom: number | null = null;
  private lastAt: number | null = null;

  constructor(
    public size: ShotSize,
    private readonly maxZoom: number,
    start: CameraView = WHOLE,
  ) {
    this.view = clampView(start, maxZoom);
  }

  get current(): CameraView {
    return this.view;
  }

  /** Reframe at a new size (Close, Waist, Full): the zoom goes there now. */
  setSize(size: ShotSize): void {
    this.size = size;
    this.targetZoom = null;
    this.zooming = true;
  }

  /** The next view, given where the person is now (null: not seen: hold still). */
  next(person: Person | null, now: number): CameraView {
    const dt = this.lastAt === null ? 1 / 15 : Math.min(0.5, (now - this.lastAt) / 1000);
    this.lastAt = now;
    if (!person) {
      this.walk.next(null, now);
      return this.view;
    }
    const walking = this.walk.next(person.eye.x, now);
    const rule = FRAMING[this.size];

    // Size: the zoom this framing wants; follow it only when it's been wrong a while.
    const want = frameFor(person, this.size, this.maxZoom, walking);
    const wrong = Math.abs(Math.log(want.zoom / this.view.zoom)) > 0.25;
    if (this.zooming || this.targetZoom === null) {
      this.targetZoom = want.zoom;
    } else if (wrong) {
      this.zoomWrongSince ??= now;
      if (now - this.zoomWrongSince > 1500) {
        this.zooming = true;
        this.targetZoom = want.zoom;
      }
    } else this.zoomWrongSince = null;
    let zoom = this.view.zoom;
    if (this.zooming) {
      zoom = glide(zoom, this.targetZoom, dt, 0.8);
      if (Math.abs(Math.log(this.targetZoom / zoom)) < 0.03) {
        zoom = this.targetZoom;
        this.zooming = false;
        this.zoomWrongSince = null;
      }
    }

    // Position, framed at the zoom it has now.
    const at = frameFor(person, this.size, this.maxZoom, walking, zoom);
    const frame = 1 / zoom;
    const ex = (at.x - this.view.x) / frame;
    const ey = (at.y - this.view.y) / frame;
    // Near the frame's edge (their torso about to leave it): catch up quicker.
    const left = (person.core.x - (this.view.x - frame / 2)) / frame;
    const right = (this.view.x + frame / 2 - (person.core.x + person.core.w)) / frame;
    const urgent = Math.min(left, right) < 0.08;
    if (Math.abs(ex) > rule.deadX || urgent) this.moving.x = true;
    else if (Math.abs(ex) < rule.deadX * 0.3) this.moving.x = false;
    if (Math.abs(ey) > rule.deadY) this.moving.y = true;
    else if (Math.abs(ey) < rule.deadY * 0.3) this.moving.y = false;
    const tau = urgent ? 0.25 : 0.7;
    this.view = clampView(
      {
        x: this.moving.x ? glide(this.view.x, at.x, dt, tau) : this.view.x,
        y: this.moving.y ? glide(this.view.y, at.y, dt, 0.9) : this.view.y,
        zoom,
      },
      this.maxZoom,
    );
    return this.view;
  }
}

/** Pan, tilt and zoom speeds, −1 to 1 (right, up and in positive; 0 stops). */
export interface PtzSpeeds {
  pan: number;
  tilt: number;
  zoom: number;
}
export const STILL: PtzSpeeds = { pan: 0, tilt: 0, zoom: 0 };

/**
 * PTZ follow: steers a real camera so the person sits on their mark in its picture (the picture
 * is the frame). Each axis starts once they're out of the dead zone and stops when they're well
 * back in; its speed grows with how far off they are, harder near the edge, and changes
 * smoothly so the camera glides. The zoom holds their size, slowly, only when it's been wrong a
 * while, and never reverses within a few seconds.
 */
export class PtzFollow {
  private moving = { x: false, y: false };
  private sent: PtzSpeeds = STILL;
  private zoomWrongSince: number | null = null;
  private zoomDir = 0;
  private zoomEnded = -Infinity;
  private lastAt: number | null = null;
  private readonly walk = new WalkSense();

  constructor(
    public size: ShotSize,
    /** How fast it may follow, 0.5–2 (the operator's speed dial). */
    public speed = 1,
    /** Keep their size with the zoom. */
    public holdSize = true,
  ) {}

  setSize(size: ShotSize): void {
    this.size = size;
    this.zoomWrongSince = -Infinity; // a new size: reframe without waiting
  }

  next(person: Person | null, now: number): PtzSpeeds {
    const dt = this.lastAt === null ? 1 / 15 : Math.min(0.5, (now - this.lastAt) / 1000);
    this.lastAt = now;
    if (!person) {
      this.walk.next(null, now);
      this.sent = STILL;
      return STILL;
    }
    // In a moving camera's picture the person stands still while it keeps up: their speed in
    // the picture is only how far behind it is, so it adds lead room only once they get away.
    const walking = this.walk.next(person.eye.x, now);
    const rule = FRAMING[this.size];
    const lead = leadFor(person, walking, rule);
    const ex = person.eye.x - (0.5 - lead);
    const ey = person.eye.y - rule.eyeLine;
    const edge = Math.min(person.core.x, 1 - (person.core.x + person.core.w));
    const urgent = edge < 0.08;
    if (Math.abs(ex) > rule.deadX || urgent) this.moving.x = true;
    else if (Math.abs(ex) < rule.deadX * 0.4) this.moving.x = false;
    if (Math.abs(ey) > rule.deadY) this.moving.y = true;
    else if (Math.abs(ey) < rule.deadY * 0.4) this.moving.y = false;

    // Speed: proportional to the error, more near the edge, at least a crawl while moving.
    const axis = (e: number, on: boolean, gain: number): number => {
      if (!on) return 0;
      const v = Math.min(1, Math.abs(e) * gain * (urgent ? 2.2 : 1) * this.speed);
      return Math.sign(e) * Math.max(0.04, v);
    };
    // Right in the picture is pan right; lower in the picture is tilt down.
    const wantPan = axis(ex, this.moving.x, 1.6);
    const wantTilt = -axis(ey, this.moving.y, 1.2);
    // Change speed smoothly (glide), but stop at once when an axis is done.
    const ease = (from: number, to: number): number =>
      to === 0 ? 0 : glide(from, to, dt, urgent ? 0.12 : 0.3);

    let zoom = 0;
    if (this.holdSize && person.shoulder !== null) {
      const r = Math.log(rule.scale / person.shoulder); // positive: too small, zoom in
      const dir = Math.sign(r);
      if (this.zoomDir !== 0) {
        if (Math.abs(r) < 0.08 || dir !== this.zoomDir) {
          this.zoomDir = 0;
          this.zoomEnded = now;
        } else zoom = dir * 0.3 * Math.min(1, this.speed);
      } else if (Math.abs(r) > 0.3) {
        this.zoomWrongSince ??= now;
        const settled = now - this.zoomEnded > 2000;
        if (now - this.zoomWrongSince > 1500 && settled) {
          this.zoomDir = dir;
          this.zoomWrongSince = null;
          zoom = dir * 0.3 * Math.min(1, this.speed);
        }
      } else this.zoomWrongSince = null;
    }

    this.sent = {
      pan: ease(this.sent.pan, wantPan),
      tilt: ease(this.sent.tilt, wantTilt),
      zoom,
    };
    return this.sent;
  }
}
