import type { z } from 'zod';
import { AppError, toErrorShape, type Result } from './result';

export type CommandSource =
  'ui' | 'remote' | 'auto-detect' | 'shortcut' | 'api' | 'midi' | 'system';

export interface Command<P = unknown> {
  type: string;
  payload: P;
  source: CommandSource;
}

export interface HandlerOutcome<R> {
  result: R;
  /** Inverse command. Present only for undoable commands that changed something. */
  undo?: Omit<Command, 'source'>;
}

export interface CommandDefinition<P, R> {
  type: string;
  schema: z.ZodType<P>;
  undoable: boolean;
  handle(payload: P, cmd: Command<P>): Promise<HandlerOutcome<R>> | HandlerOutcome<R>;
}

export interface AuditEntry {
  at: string;
  type: string;
  source: CommandSource;
  ok: boolean;
  errorCode?: string;
}

interface HistoryEntry {
  label: string;
  inverse: Omit<Command, 'source'>;
}

/**
 * All state mutations go through here (§3.3): validation, undo/redo, and an audit log of what
 * happened and why ("why did that verse appear?").
 */
export class CommandBus {
  private defs = new Map<string, CommandDefinition<unknown, unknown>>();
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private auditListeners = new Set<(e: AuditEntry) => void>();
  private historyListeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly maxHistory = 200) {}

  register<P, R>(def: CommandDefinition<P, R>): void {
    if (this.defs.has(def.type)) throw new Error(`Command already registered: ${def.type}`);
    this.defs.set(def.type, def);
  }

  has(type: string): boolean {
    return this.defs.has(type);
  }

  /** Commands run strictly in order so concurrent sources (UI, remote, auto-detect) never race. */
  dispatch<R = unknown>(cmd: Command): Promise<Result<R>> {
    const run = this.queue.then(() => this.execute<R>(cmd, 'normal'));
    this.queue = run.catch(() => undefined);
    return run;
  }

  undo(): Promise<Result<boolean>> {
    return this.replay('undo');
  }

  redo(): Promise<Result<boolean>> {
    return this.replay('redo');
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  history(): { undo: string[]; redo: string[] } {
    return { undo: this.undoStack.map((h) => h.label), redo: this.redoStack.map((h) => h.label) };
  }

  onAudit(l: (e: AuditEntry) => void): () => void {
    this.auditListeners.add(l);
    return () => this.auditListeners.delete(l);
  }
  onHistoryChange(l: () => void): () => void {
    this.historyListeners.add(l);
    return () => this.historyListeners.delete(l);
  }

  private replay(direction: 'undo' | 'redo'): Promise<Result<boolean>> {
    const run = this.queue.then(async (): Promise<Result<boolean>> => {
      const stack = direction === 'undo' ? this.undoStack : this.redoStack;
      const entry = stack.pop();
      if (!entry) return { ok: true, value: false };
      const res = await this.execute({ ...entry.inverse, source: 'ui' }, direction, entry.label);
      // The stacks changed even if the inverse produced no further step — keep the UI in sync.
      for (const l of this.historyListeners) l();
      return res.ok ? { ok: true, value: true } : res;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async execute<R>(
    cmd: Command,
    mode: 'normal' | 'undo' | 'redo',
    label?: string,
  ): Promise<Result<R>> {
    const def = this.defs.get(cmd.type);
    const audit = (ok: boolean, errorCode?: string): void => {
      const e: AuditEntry = {
        at: new Date().toISOString(),
        type: cmd.type,
        source: cmd.source,
        ok,
      };
      if (errorCode) e.errorCode = errorCode;
      for (const l of this.auditListeners) l(e);
    };
    if (!def) {
      audit(false, 'unknown-command');
      return { ok: false, error: { code: 'unknown-command', message: `Unknown command` } };
    }
    const parsed = def.schema.safeParse(cmd.payload);
    if (!parsed.success) {
      audit(false, 'invalid-payload');
      return { ok: false, error: { code: 'invalid-payload', message: 'Invalid command payload' } };
    }
    try {
      const outcome = await def.handle(parsed.data, { ...cmd, payload: parsed.data });
      if (def.undoable && outcome.undo) {
        const entry: HistoryEntry = { label: label ?? cmd.type, inverse: outcome.undo };
        if (mode === 'undo') this.redoStack.push(entry);
        else {
          this.undoStack.push(entry);
          if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
          if (mode === 'normal') this.redoStack = [];
        }
        for (const l of this.historyListeners) l();
      }
      audit(true);
      return { ok: true, value: outcome.result as R };
    } catch (e) {
      const shape = e instanceof AppError ? e.toShape() : toErrorShape(e);
      audit(false, shape.code);
      return { ok: false, error: shape };
    }
  }
}
