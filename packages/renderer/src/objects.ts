import type { SlideObject } from '@lampstand/core';
import { el } from './dom';
import { cssFontStack } from './style';
import type { StyleInit } from './types';

/**
 * Box style of a slide object on the 1920×1080 canvas: position, size, fill, stroke, shape.
 * Shared by the output renderer and the canvas editor, so what you drag is what the room sees.
 */
export function objectBoxStyle(o: SlideObject): StyleInit {
  const box: StyleInit = {
    position: 'absolute',
    left: `${o.x}px`,
    top: `${o.y}px`,
    width: `${o.w}px`,
    height: `${o.h}px`,
    boxSizing: 'border-box',
    opacity: String(o.opacity ?? 1),
  };
  switch (o.kind) {
    case 'rect':
    case 'ellipse':
      return {
        ...box,
        background: o.fill ?? 'transparent',
        border: o.stroke && o.stroke.width > 0 ? `${o.stroke.width}px solid ${o.stroke.color}` : '',
        borderRadius: o.kind === 'ellipse' ? '50%' : `${o.radius ?? 0}px`,
      };
    case 'line':
      // A horizontal rule centred in its box; the box height is just the grab area.
      return {
        ...box,
        background: `linear-gradient(${o.stroke.color}, ${o.stroke.color}) center / 100% ${o.stroke.width}px no-repeat`,
      };
    case 'text':
      return {
        ...box,
        display: 'flex',
        alignItems: 'center',
        justifyContent:
          o.align === 'left' ? 'flex-start' : o.align === 'right' ? 'flex-end' : 'center',
        textAlign: o.align,
        color: o.color,
        fontFamily: cssFontStack(o.fontFamily ?? 'Inter'),
        fontSize: `${o.fontSize}px`,
        fontWeight: o.bold ? '700' : '500',
        fontStyle: o.italic ? 'italic' : 'normal',
        lineHeight: '1.2',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
        overflow: 'hidden',
      };
    case 'image':
      return { ...box, overflow: 'hidden' };
  }
}

/** One slide object as DOM. Text always goes in as a text node, never HTML. */
export function buildObject(
  doc: Document,
  o: SlideObject,
  mediaUrl: (id: string) => string,
): HTMLElement {
  const node = el(doc, 'div', `ls-object ls-object-${o.kind}`, objectBoxStyle(o));
  if (o.kind === 'text') node.textContent = o.text;
  if (o.kind === 'image') {
    const img = el(doc, 'img', '', { width: '100%', height: '100%', objectFit: o.fit });
    img.src = mediaUrl(o.mediaId);
    img.alt = '';
    node.append(img);
  }
  return node;
}

/** All of a slide's objects on a canvas-sized layer, in order (later = on top). */
export function buildObjectsLayer(
  doc: Document,
  objects: SlideObject[],
  size: { width: number; height: number },
  mediaUrl: (id: string) => string,
): HTMLElement {
  const layer = el(doc, 'div', 'ls-objects', {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${size.width}px`,
    height: `${size.height}px`,
    pointerEvents: 'none',
  });
  layer.append(...objects.map((o) => buildObject(doc, o, mediaUrl)));
  return layer;
}
