import { z } from 'zod';
import { IdSchema } from './common';

/**
 * Camera control (Media › Video input › Camera): a digital shot inside a camera's picture, a
 * PTZ camera's network address, and the shots saved for each camera.
 */

/**
 * A digital shot: the middle of the frame (0–1 of the camera's picture) and the zoom (1 = the
 * whole picture, 2 = half its width and height). Applied wherever that camera is shown.
 */
export const CameraViewSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  zoom: z.number().min(1).max(8),
});
export type CameraView = z.infer<typeof CameraViewSchema>;

/** How far a camera's picture may be zoomed digitally before it turns soft. */
export function maxDigitalZoom(resolution: 'auto' | '720' | '1080' | '2160'): number {
  return resolution === '2160' ? 4 : resolution === '720' ? 1.5 : 2.5;
}

/** A host name, IPv4 or IPv6 address (letters, digits, dots, colons, dashes). */
const Host = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .regex(/^[A-Za-z0-9.:\-[\]]+$/);

/** A PTZ camera on the network, spoken to with VISCA. */
export const PtzConnectionSchema = z.object({
  protocol: z.enum(['visca-udp', 'visca-tcp']),
  host: Host,
  port: z.number().int().min(1).max(65_535),
});
export type PtzConnection = z.infer<typeof PtzConnectionSchema>;

/** Where a PTZ camera pointed, in its own counts (so going back is exact). */
export const PtzPositionSchema = z.object({
  pan: z.number().int().min(-32_768).max(32_767),
  tilt: z.number().int().min(-32_768).max(32_767),
  zoom: z.number().int().min(0).max(65_535),
});
export type PtzPosition = z.infer<typeof PtzPositionSchema>;

/**
 * A saved shot: a digital view, a PTZ position, or (a camera that won't say where it points)
 * one of the camera's own preset slots.
 */
export const CameraShotSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(40),
  view: CameraViewSchema.optional(),
  ptz: PtzPositionSchema.optional(),
  preset: z.number().int().min(0).max(127).optional(),
});
export type CameraShot = z.infer<typeof CameraShotSchema>;

/** Commands for the digital shots on screen (`live.camera`). */
export const CameraActionSchema = z.object({
  action: z.literal('view'),
  deviceId: z.string().min(1).max(300),
  /** Null: the whole picture again. */
  view: CameraViewSchema.nullable(),
});
export type CameraAction = z.infer<typeof CameraActionSchema>;

/** Every camera's digital shot, after a command (pure). The whole picture is no entry. */
export function applyCameraAction(
  views: Readonly<Record<string, CameraView>>,
  a: CameraAction,
): Record<string, CameraView> {
  const whole =
    !a.view ||
    (a.view.zoom <= 1.001 && Math.abs(a.view.x - 0.5) < 1e-3 && Math.abs(a.view.y - 0.5) < 1e-3);
  const rest = Object.fromEntries(Object.entries(views).filter(([id]) => id !== a.deviceId));
  return whole || !a.view ? rest : { ...rest, [a.deviceId]: a.view };
}

const Device = z.string().min(1).max(300);
const Speed = z.number().min(-1).max(1);

/**
 * Commands for a PTZ camera (`camera.ptz`), by the device it feeds. Moves (`drive`, `zoom`)
 * must be renewed while they last (the joystick and follow do, several times a second): one not
 * renewed for a second is stopped, so a camera is never left turning.
 */
export const PtzCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('drive'), deviceId: Device, pan: Speed, tilt: Speed }),
  z.object({ action: z.literal('zoom'), deviceId: Device, speed: Speed }),
  z.object({ action: z.literal('stop'), deviceId: Device }),
  z.object({ action: z.literal('home'), deviceId: Device }),
  z.object({
    action: z.literal('focus'),
    deviceId: Device,
    mode: z.enum(['auto', 'manual', 'once']),
  }),
  z.object({
    action: z.literal('exposure'),
    deviceId: Device,
    mode: z.enum(['auto', 'manual', 'shutter', 'iris', 'bright']),
  }),
  z.object({
    action: z.literal('step'),
    deviceId: Device,
    what: z.enum(['iris', 'shutter', 'gain']),
    dir: z.enum(['up', 'down']),
  }),
  z.object({
    action: z.literal('whiteBalance'),
    deviceId: Device,
    mode: z.enum(['auto', 'indoor', 'outdoor', 'onePush', 'manual']),
  }),
  z.object({ action: z.literal('whiteBalanceOnce'), deviceId: Device }),
  z.object({
    action: z.literal('goTo'),
    deviceId: Device,
    position: PtzPositionSchema,
    speed: z.number().min(0.05).max(1).optional(),
  }),
  z.object({
    action: z.literal('recall'),
    deviceId: Device,
    slot: z.number().int().min(0).max(127),
  }),
  z.object({
    action: z.literal('store'),
    deviceId: Device,
    slot: z.number().int().min(0).max(127),
  }),
  /** Where it points now: answers a PtzPosition, or null if the camera didn't say. */
  z.object({ action: z.literal('position'), deviceId: Device }),
]);
export type PtzCommand = z.infer<typeof PtzCommandSchema>;
