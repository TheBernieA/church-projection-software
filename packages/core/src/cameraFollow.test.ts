import { describe, expect, it } from 'vitest';
import {
  clampView,
  DigitalFollow,
  FRAMING,
  frameFor,
  personFromLandmarks,
  PersonLock,
  PtzFollow,
  type Landmark,
  type Person,
} from './cameraFollow';
import { applyCameraAction, CameraShotSchema, PtzConnectionSchema } from './schemas/camera';
import { CameraSettingsSchema } from './schemas/scene';

/** A person standing at (x, eyeY), this tall in the picture (eyes to shoulders = 0.18 × height). */
function person(x: number, eyeY = 0.3, height = 0.6, facing: -1 | 0 | 1 = 0): Person {
  const shoulder = height * 0.18;
  return {
    box: { x: x - height * 0.15, y: eyeY - height * 0.08, w: height * 0.3, h: height },
    core: { x: x - height * 0.1, y: eyeY - height * 0.05, w: height * 0.2, h: height * 0.5 },
    eye: { x, y: eyeY },
    shoulder,
    facing,
  };
}

/** Landmarks for a standing person, as MediaPipe gives them. */
function landmarks(x: number, noseShift = 0): Landmark[] {
  const l: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  const at = (i: number, px: number, py: number) => (l[i] = { x: px, y: py, visibility: 0.9 });
  at(0, x + noseShift, 0.32);
  at(2, x - 0.01, 0.3);
  at(5, x + 0.01, 0.3);
  at(11, x - 0.05, 0.42);
  at(12, x + 0.05, 0.42);
  at(23, x - 0.04, 0.62);
  at(24, x + 0.04, 0.62);
  at(27, x - 0.03, 0.9);
  at(28, x + 0.03, 0.9);
  return l;
}

describe('a person from body landmarks', () => {
  it('eyes, size and outline; facing from the nose', () => {
    const p = personFromLandmarks(landmarks(0.4));
    expect(p?.eye).toEqual({ x: 0.4, y: 0.3 });
    expect(p?.shoulder).toBeCloseTo(0.12, 5);
    expect(p?.box.h).toBeCloseTo(0.6, 5);
    expect(p?.facing).toBe(0);
    expect(personFromLandmarks(landmarks(0.4, 0.05))?.facing).toBe(1);
    expect(personFromLandmarks(landmarks(0.4, -0.05))?.facing).toBe(-1);
  });

  it('a shape that isn’t upright (eyes under the shoulders, hips over them) is nobody', () => {
    // As measured on a car's wheel: eyes 0.72, shoulders 0.70, hips 0.60.
    const l = landmarks(0.5).map((p, i) =>
      i === 2 || i === 5
        ? { ...p, y: 0.72 }
        : i === 11 || i === 12
          ? { ...p, y: 0.7 }
          : i === 23 || i === 24
            ? { ...p, y: 0.6 }
            : p,
    );
    expect(personFromLandmarks(l)).toBeNull();
    const folded = landmarks(0.5).map((p, i) => (i === 23 || i === 24 ? { ...p, y: 0.41 } : p));
    expect(personFromLandmarks(folded)).toBeNull();
  });

  it('no eyes or shoulders seen: nobody', () => {
    const l = landmarks(0.5).map((p, i) => (i === 11 || i === 12 ? { ...p, visibility: 0.1 } : p));
    expect(personFromLandmarks(l)).toBeNull();
  });
});

describe('keeping to one person', () => {
  it('starts on the one clicked, or the one nearest the middle', () => {
    const a = person(0.2);
    const b = person(0.55);
    expect(new PersonLock().start([a, b])).toBe(b);
    expect(new PersonLock().start([a, b], { x: 0.2, y: 0.5 })).toBe(a);
  });

  it('follows them as they walk, and doesn’t jump to someone across the stage', () => {
    const lock = new PersonLock();
    lock.start([person(0.3)]);
    let t = 0;
    for (let x = 0.3; x < 0.6; x += 0.01) {
      t += 66;
      expect(lock.next([person(x), person(0.9)], t)?.eye.x).toBeCloseTo(x, 5);
    }
    // They leave: the one across the stage is not taken instead.
    t += 66;
    expect(lock.next([person(0.05)], t)).toBeNull();
    expect(lock.lost(t + 600)).toBe(true);
    // Back near where they were: found again.
    expect(lock.next([person(0.6)], t + 700)?.eye.x).toBeCloseTo(0.6, 5);
  });
});

describe('framing', () => {
  it('waist up: eyes on the eye line, sized by eyes to shoulders', () => {
    const p = person(0.5, 0.3, 0.6);
    const v = frameFor(p, 'waist', 4);
    expect(v.zoom).toBeCloseTo(FRAMING.waist.scale / (0.6 * 0.18), 5);
    // Eyes sit eyeLine down from the frame's top.
    const top = v.y - 0.5 / v.zoom;
    expect((p.eye.y - top) * v.zoom).toBeCloseTo(FRAMING.waist.eyeLine, 3);
  });

  it('lead room on the side they face; never past the picture’s edge', () => {
    const right = frameFor(person(0.5, 0.3, 0.6, 1), 'waist', 4);
    const left = frameFor(person(0.5, 0.3, 0.6, -1), 'waist', 4);
    expect(right.x).toBeGreaterThan(0.5);
    expect(left.x).toBeLessThan(0.5);
    const edge = frameFor(person(0.02), 'close', 4);
    expect(edge.x - 0.5 / edge.zoom).toBeGreaterThanOrEqual(0);
    expect(clampView({ x: 0, y: 1, zoom: 9 }, 3)).toEqual({ x: 1 / 6, y: 5 / 6, zoom: 3 });
  });
});

/** Where the eyes are inside a digital frame (0–1 of the frame). */
const inFrame = (p: Person, v: { x: number; y: number; zoom: number }) => ({
  x: (p.eye.x - (v.x - 0.5 / v.zoom)) * v.zoom,
  y: (p.eye.y - (v.y - 0.5 / v.zoom)) * v.zoom,
});

describe('digital follow', () => {
  it('a small sway doesn’t move the shot (dead zone)', () => {
    const f = new DigitalFollow('waist', 4);
    let t = 0;
    for (let i = 0; i < 60; i++) f.next(person(0.5), (t += 66));
    const settled = f.current;
    for (let i = 0; i < 30; i++) f.next(person(0.5 + (i % 2 ? 0.004 : -0.004)), (t += 66));
    expect(f.current.x).toBeCloseTo(settled.x, 4);
  });

  it('keeps someone walking across the stage in the frame, and settles on their mark', () => {
    const f = new DigitalFollow('waist', 4);
    let t = 0;
    for (let i = 0; i < 40; i++) f.next(person(0.25), (t += 66));
    let worst = 0;
    // Walking at a fifth of the picture a second.
    for (let x = 0.25; x <= 0.75; x += 0.2 / 15) {
      const p = person(x);
      const e = inFrame(p, f.next(p, (t += 66)));
      worst = Math.max(worst, Math.abs(e.x - 0.5));
    }
    expect(worst).toBeLessThan(0.45); // never out of the frame
    for (let i = 0; i < 60; i++) f.next(person(0.75), (t += 66));
    expect(Math.abs(inFrame(person(0.75), f.current).x - 0.5)).toBeLessThan(
      FRAMING.waist.deadX + 0.02,
    );
  });

  it('a new size reframes; a person coming nearer is held at their size, slowly', () => {
    const f = new DigitalFollow('waist', 4);
    let t = 0;
    for (let i = 0; i < 60; i++) f.next(person(0.5, 0.3, 0.6), (t += 66));
    const waist = f.current.zoom;
    f.setSize('full');
    for (let i = 0; i < 60; i++) f.next(person(0.5, 0.3, 0.6), (t += 66));
    expect(f.current.zoom).toBeLessThan(waist);
    // Nothing changes for a moment when they look a little bigger…
    f.setSize('waist');
    for (let i = 0; i < 60; i++) f.next(person(0.5, 0.3, 0.6), (t += 66));
    const held = f.current.zoom;
    f.next(person(0.5, 0.3, 0.9), (t += 66));
    expect(f.current.zoom).toBeCloseTo(held, 5);
    // …but held a while, the zoom follows.
    for (let i = 0; i < 90; i++) f.next(person(0.5, 0.3, 0.9), (t += 66));
    expect(f.current.zoom).toBeLessThan(held);
  });

  it('nobody seen: the shot holds still', () => {
    const f = new DigitalFollow('waist', 4);
    let t = 0;
    for (let i = 0; i < 30; i++) f.next(person(0.4), (t += 66));
    const v = f.current;
    expect(f.next(null, t + 66)).toEqual(v);
  });
});

describe('PTZ follow', () => {
  /**
   * A pretend PTZ camera: a person at a fixed spot on stage (in degrees), the camera panning
   * at up to 30°/s with a 40° view; the person's place in the picture follows.
   */
  function simulate(walk: (t: number) => number, seconds: number) {
    const f = new PtzFollow('waist');
    let pan = 0;
    let worst = 0;
    let last = 0;
    for (let t = 0; t < seconds * 1000; t += 66) {
      const x = 0.5 + (walk(t / 1000) - pan) / 40;
      const p = person(x);
      const s = f.next(p, t);
      pan += s.pan * 30 * 0.066;
      if (t > 2000) worst = Math.max(worst, Math.abs(x - 0.5));
      last = s.pan;
    }
    return { worst, last, pan };
  }

  it('stays on someone walking the stage, then settles and stops', () => {
    // Walks from 0° to 20° in 10 s, then stands.
    const r = simulate((s) => Math.min(20, s * 2), 20);
    expect(r.worst).toBeLessThan(0.3);
    expect(r.last).toBe(0); // stopped once they're on their mark
    expect(r.pan).toBeGreaterThan(15);
  });

  it('a small sway doesn’t move the camera', () => {
    const f = new PtzFollow('waist');
    let moved = 0;
    for (let t = 0; t < 5000; t += 66)
      moved += Math.abs(f.next(person(0.5 + Math.sin(t / 300) * 0.03), t).pan);
    expect(moved).toBe(0);
  });

  it('lost from view: everything stops at once', () => {
    const f = new PtzFollow('waist');
    f.next(person(0.9), 0);
    expect(f.next(person(0.9), 66).pan).toBeGreaterThan(0);
    expect(f.next(null, 132)).toEqual({ pan: 0, tilt: 0, zoom: 0 });
  });

  it('holds their size: zooms in (slowly) only when they’ve looked too small for a while', () => {
    const f = new PtzFollow('waist');
    const far = person(0.5, 0.29, 0.3); // eyes to shoulders 0.054 vs 0.21 wanted
    let t = 0;
    expect(f.next(far, t).zoom).toBe(0);
    let zoom = 0;
    for (let i = 0; i < 40; i++) zoom = f.next(far, (t += 66)).zoom;
    expect(zoom).toBeGreaterThan(0);
    expect(zoom).toBeLessThanOrEqual(0.3);
  });
});

describe('camera settings and shots', () => {
  it('a camera saved before has no PTZ and no shots', () => {
    expect(CameraSettingsSchema.parse({ name: 'Cam 1' })).toMatchObject({ ptz: null, shots: [] });
  });

  it('a PTZ address is a host and a port, nothing else', () => {
    expect(
      PtzConnectionSchema.safeParse({ protocol: 'visca-udp', host: '192.168.1.40', port: 52381 })
        .success,
    ).toBe(true);
    expect(
      PtzConnectionSchema.safeParse({ protocol: 'visca-tcp', host: 'cam1.local', port: 5678 })
        .success,
    ).toBe(true);
    expect(
      PtzConnectionSchema.safeParse({ protocol: 'visca-tcp', host: 'http://x/y', port: 5678 })
        .success,
    ).toBe(false);
    expect(
      PtzConnectionSchema.safeParse({ protocol: 'visca-tcp', host: 'a', port: 70000 }).success,
    ).toBe(false);
  });

  it('a shot is a view, a position or a preset', () => {
    expect(
      CameraShotSchema.safeParse({ id: 's', name: 'Pulpit', view: { x: 0.4, y: 0.4, zoom: 2 } })
        .success,
    ).toBe(true);
    expect(
      CameraShotSchema.safeParse({
        id: 's',
        name: 'Pulpit',
        ptz: { pan: -400, tilt: 20, zoom: 9000 },
      }).success,
    ).toBe(true);
    expect(CameraShotSchema.safeParse({ id: 's', name: '', preset: 3 }).success).toBe(false);
  });

  it('the whole picture is no view at all', () => {
    let views = applyCameraAction(
      {},
      { action: 'view', deviceId: 'cam', view: { x: 0.3, y: 0.4, zoom: 2 } },
    );
    expect(views).toEqual({ cam: { x: 0.3, y: 0.4, zoom: 2 } });
    views = applyCameraAction(views, {
      action: 'view',
      deviceId: 'cam',
      view: { x: 0.5, y: 0.5, zoom: 1 },
    });
    expect(views).toEqual({});
    expect(
      applyCameraAction(
        { cam: { x: 0.3, y: 0.4, zoom: 2 } },
        { action: 'view', deviceId: 'cam', view: null },
      ),
    ).toEqual({});
  });
});
