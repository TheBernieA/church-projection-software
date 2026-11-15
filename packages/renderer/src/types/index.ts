/** Plain style object (not a CSSStyleDeclaration, which is iterable and unsafe to spread). */
export type StyleInit = Partial<Record<Extract<keyof CSSStyleDeclaration, string>, string>>;

export interface MediaResolver {
  /** URL for a library media id, e.g. `lampstand-media://<id>`. */
  mediaUrl(mediaId: string): string;
}

export type RenderMode = 'output' | 'monitor' | 'thumbnail';

export interface SceneRendererOptions extends MediaResolver {
  mode: RenderMode;
  /** Logical canvas; defaults to 1920×1080. */
  canvas?: { width: number; height: number };
  /** Whether this renderer may play media audio (exactly one should; see {@link setAudio}). */
  audio?: boolean;
  /** Transparent stage (alpha/key output). */
  transparent?: boolean;
}

export interface BuiltContent {
  root: HTMLElement;
  /** Must be called once the root is attached to the stage, before it becomes visible. */
  fit(): void;
  dispose(): void;
}
