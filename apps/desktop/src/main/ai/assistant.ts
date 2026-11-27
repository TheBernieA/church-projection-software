import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import { AppError } from '@lampstand/core';
import {
  LYRICS_SYSTEM,
  LyricsDraftSchema,
  PLANNER_SYSTEM,
  PlanDraftSchema,
  lyricsUserMessage,
  planUserMessage,
  type LyricsDraft,
  type PlanDraft,
  type PlanRequest,
} from '@lampstand/planner';
import type { SecretStore } from '../secrets/secretStore';
import type { Logger } from '../types';

/**
 * The online assistant (ADR 0008): the only code that talks to Anthropic. The key lives in
 * the keychain (SecretStore) and never leaves main; a request carries only what the operator
 * typed or pasted. Logs say what ran, how long it took and what it cost in tokens — never the
 * key, and never the content.
 */

export const ASSISTANT_KEY = 'assistant:anthropic';
export const ASSISTANT_MODEL = 'claude-opus-5-5';
const TIMEOUT_MS = 120_000;

/** What a request needs from the SDK (a fake in tests). */
export interface Messages {
  parse(params: Record<string, unknown>): Promise<{
    stop_reason: string | null;
    parsed_output?: unknown;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number | null;
    };
  }>;
}
export interface Client {
  messages: Messages;
  checkModel(model: string): Promise<void>;
}

export type ClientFactory = (apiKey: string) => Client;

export const anthropicClient: ClientFactory = (apiKey) => {
  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 2 });
  return {
    messages: {
      parse: (params) =>
        client.beta.messages.parse(
          params as unknown as Parameters<typeof client.beta.messages.parse>[0],
        ),
    },
    checkModel: async (model) => {
      await client.models.retrieve(model);
    },
  };
};

/** Plain words for every way a request can fail (the operator can act on each). */
export function assistantError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
    return new AppError(
      'assistant-key',
      'Anthropic didn’t accept the API key. Check it in Settings › Assistant.',
    );
  if (e instanceof Anthropic.RateLimitError)
    return new AppError(
      'assistant-busy',
      'Anthropic says this key has made too many requests just now. Wait a minute and try again.',
    );
  if (e instanceof Anthropic.APIConnectionError)
    return new AppError(
      'assistant-offline',
      'Lampstand couldn’t reach Anthropic. Check the internet connection and try again.',
    );
  if (e instanceof Anthropic.BadRequestError && /credit|billing/i.test(e.message))
    return new AppError(
      'assistant-billing',
      'The Anthropic account has no credit left. Add credit in the Anthropic Console and try again.',
    );
  if (e instanceof Anthropic.APIError && (e.status === 529 || (e.status ?? 0) >= 500))
    return new AppError('assistant-busy', 'Anthropic is busy right now. Try again in a minute.');
  return new AppError('assistant-failed', 'The assistant couldn’t finish that. Try again.');
}

export class Assistant {
  constructor(
    private readonly o: {
      secrets: SecretStore;
      log: Logger;
      client?: ClientFactory;
    },
  ) {}

  hasKey(): Promise<boolean> {
    return this.o.secrets.has(ASSISTANT_KEY);
  }

  /** Save a key after checking Anthropic accepts it. */
  async setKey(key: string): Promise<void> {
    const clean = key.trim();
    if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(clean))
      throw new AppError(
        'assistant-key-format',
        'That doesn’t look like an Anthropic API key (they start with “sk-ant-”).',
      );
    await this.check(clean);
    await this.o.secrets.set(ASSISTANT_KEY, clean);
    this.o.log.info('assistant key saved');
  }

  forgetKey(): Promise<void> {
    this.o.log.info('assistant key forgotten');
    return this.o.secrets.delete(ASSISTANT_KEY);
  }

  /** Is the saved key (or the one given) accepted? */
  async check(key?: string): Promise<void> {
    const k = key ?? (await this.key());
    try {
      await (this.o.client ?? anthropicClient)(k).checkModel(ASSISTANT_MODEL);
    } catch (e) {
      throw assistantError(e);
    }
  }

  planService(req: PlanRequest): Promise<PlanDraft> {
    return this.ask('plan', PLANNER_SYSTEM, planUserMessage(req), PlanDraftSchema);
  }

  structureLyrics(text: string): Promise<LyricsDraft> {
    return this.ask('lyrics', LYRICS_SYSTEM, lyricsUserMessage(text), LyricsDraftSchema);
  }

  private async key(): Promise<string> {
    const k = await this.o.secrets.get(ASSISTANT_KEY);
    if (!k)
      throw new AppError(
        'assistant-no-key',
        'The assistant needs an Anthropic API key. Add one in Settings › Assistant.',
      );
    return k;
  }

  private async ask<T>(
    task: string,
    system: string,
    content: string,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const client = (this.o.client ?? anthropicClient)(await this.key());
    const started = Date.now();
    try {
      const res = await client.messages.parse({
        model: ASSISTANT_MODEL,
        max_tokens: 16000,
        // A request the model declines is retried on Anthropic's own fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        // The instructions never change, so they're cached between requests.
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content }],
        output_config: { effort: 'medium', format: betaZodOutputFormat(schema) },
      });
      this.o.log.info('assistant answered', {
        task,
        ms: Date.now() - started,
        stop: res.stop_reason,
        inTokens: res.usage?.input_tokens,
        outTokens: res.usage?.output_tokens,
        cachedTokens: res.usage?.cache_read_input_tokens ?? 0,
      });
      if (res.stop_reason === 'refusal')
        throw new AppError(
          'assistant-refused',
          'The assistant wouldn’t do that one. Reword it and try again.',
        );
      if (res.stop_reason === 'max_tokens')
        throw new AppError(
          'assistant-too-long',
          'That was too long to finish in one go. Try it in parts.',
        );
      const parsed = schema.safeParse(res.parsed_output);
      if (!parsed.success)
        throw new AppError('assistant-failed', 'The assistant’s answer was incomplete. Try again.');
      return parsed.data;
    } catch (e) {
      const err = assistantError(e);
      this.o.log.warn('assistant failed', { task, code: err.code, ms: Date.now() - started });
      throw err;
    }
  }
}
