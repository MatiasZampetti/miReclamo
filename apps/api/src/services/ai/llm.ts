import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';

/**
 * Capa de proveedor del modelo de lenguaje. El agente habla con esta interfaz
 * y no sabe si atrás está Claude o un modelo abierto en Groq: se elige con
 * LLM_PROVIDER en el .env, sin tocar código.
 *
 * Los dos usan formatos distintos para las herramientas (Anthropic: bloques
 * tool_use / tool_result; Groq: el formato de OpenAI, tool_calls / role
 * "tool"). Cada implementación guarda su propio historial del turno.
 */

/** Definición de herramienta: nombre, descripción y JSON Schema de la entrada. */
export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Lo que devolvió el modelo en un paso: un texto final o una llamada a herramienta. */
export type StepResult = { type: 'text'; text: string } | { type: 'tool'; call: ToolCall };

export interface ChatTurn {
  step(): Promise<StepResult>;
  /** Devuelve al modelo el resultado de la herramienta que pidió en el último paso. */
  addToolResult(call: ToolCall, result: string, isError: boolean): void;
}

export interface ChatOptions {
  /** Se pide en cada paso porque cambia dentro del turno (ej. vecino recién registrado) */
  system: () => Promise<string>;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  tools: ToolSpec[];
}

export function startChat(opts: ChatOptions): ChatTurn {
  return env.LLM_PROVIDER === 'anthropic' ? new AnthropicChat(opts) : new GroqChat(opts);
}

/** Pedido simple de una sola vuelta, sin herramientas (lo usa el backfill del mapa). */
export async function complete(system: string, user: string): Promise<string> {
  const turn = startChat({ system: async () => system, history: [{ role: 'user', content: user }], tools: [] });
  const result = await turn.step();
  return result.type === 'text' ? result.text : '';
}

// ── Claude ────────────────────────────────────────────────────────

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

class AnthropicChat implements ChatTurn {
  private client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  private messages: Anthropic.MessageParam[];
  private lastContent: Anthropic.ContentBlock[] = [];

  constructor(private opts: ChatOptions) {
    this.messages = opts.history.map((m) => ({ role: m.role, content: m.content }));
  }

  async step(): Promise<StepResult> {
    const response = await this.client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: await this.opts.system(),
      ...(this.opts.tools.length > 0
        ? {
            tools: this.opts.tools as Anthropic.Tool[],
            // Una herramienta por respuesta: el orden importa (registrar antes de guardar)
            tool_choice: { type: 'auto', disable_parallel_tool_use: true },
          }
        : {}),
      messages: this.messages,
    });
    this.lastContent = response.content;

    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (response.stop_reason === 'tool_use' && toolUse) {
      return {
        type: 'tool',
        call: { id: toolUse.id, name: toolUse.name, input: toolUse.input as Record<string, unknown> },
      };
    }
    const text = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    return { type: 'text', text: text?.text ?? '' };
  }

  addToolResult(call: ToolCall, result: string, isError: boolean): void {
    this.messages.push({ role: 'assistant', content: this.lastContent });
    this.messages.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: call.id, content: result, is_error: isError }],
    });
  }
}

// ── Groq (API compatible con OpenAI) ─────────────────────────────

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

type OpenAIMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OpenAIToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

class GroqChat implements ChatTurn {
  private messages: OpenAIMessage[];
  private lastToolCall: OpenAIToolCall | null = null;
  private lastText: string | null = null;

  constructor(private opts: ChatOptions) {
    this.messages = opts.history.map((m) => ({ role: m.role, content: m.content }));
  }

  async step(): Promise<StepResult> {
    const body = {
      model: env.GROQ_MODEL,
      max_tokens: 1024,
      // gpt-oss razona antes de responder: en "low" alcanza para esta tarea,
      // responde más rápido y gasta menos del tope de tokens por minuto del plan gratis
      ...(env.GROQ_MODEL.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
      messages: [{ role: 'system', content: await this.opts.system() }, ...this.messages],
      ...(this.opts.tools.length > 0
        ? {
            tools: this.opts.tools.map((t) => ({
              type: 'function',
              function: { name: t.name, description: t.description, parameters: t.input_schema },
            })),
            tool_choice: 'auto',
            parallel_tool_calls: false,
          }
        : {}),
    };

    const data = await groqRequest(body);
    const message = data.choices?.[0]?.message ?? {};
    const toolCall: OpenAIToolCall | undefined = message.tool_calls?.[0];

    this.lastText = message.content ?? null;
    this.lastToolCall = toolCall ?? null;

    if (toolCall) {
      return {
        type: 'tool',
        call: { id: toolCall.id, name: toolCall.function.name, input: parseArguments(toolCall.function.arguments) },
      };
    }
    return { type: 'text', text: (message.content ?? '').trim() };
  }

  addToolResult(call: ToolCall, result: string, isError: boolean): void {
    this.messages.push({
      role: 'assistant',
      content: this.lastText,
      tool_calls: this.lastToolCall ? [this.lastToolCall] : [],
    });
    // El formato de OpenAI no tiene is_error: se marca en el propio texto
    this.messages.push({ role: 'tool', tool_call_id: call.id, content: isError ? `ERROR: ${result}` : result });
  }
}

const MAX_GROQ_RETRIES = 4;
const MAX_WAIT_MS = 20_000;

/**
 * Llamada a Groq con reintentos acotados:
 * - 429: se pasó el tope de tokens por minuto del plan gratuito (8.000; cada
 *   llamada del agente usa ~2.500). Groq dice cuánto esperar ("try again in
 *   1.08s"): se espera eso y se reintenta, en vez de dejar al vecino sin respuesta.
 * - tool_use_failed: el modelo armó mal la llamada a la herramienta (pasa a
 *   veces con modelos abiertos); otra vuelta suele salir bien.
 */
async function groqRequest(body: unknown, attempt = 0): Promise<any> {
  const res = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) return res.json();

  const text = await res.text();
  const retryable = res.status === 429 || (res.status === 400 && text.includes('tool_use_failed'));
  if (retryable && attempt < MAX_GROQ_RETRIES) {
    await new Promise((r) => setTimeout(r, retryDelayMs(res, text, attempt)));
    return groqRequest(body, attempt + 1);
  }
  throw new Error(`Groq devolvió ${res.status}: ${text.slice(0, 300)}`);
}

function retryDelayMs(res: Response, text: string, attempt: number): number {
  const suggested = text.match(/try again in ([\d.]+)s/i);
  const seconds = suggested ? parseFloat(suggested[1]) : Number(res.headers.get('retry-after'));
  const suggestedMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 + 250 : 0;
  // Lo que sugiere Groq suele quedarse corto (el tope es sobre el último
  // minuto y los mensajes anteriores siguen contando): la espera crece por intento
  return Math.min(Math.max(suggestedMs, 3000 * (attempt + 1)), MAX_WAIT_MS);
}

/** Los argumentos llegan como string JSON; si vienen rotos, la validación del agente lo ataja. */
function parseArguments(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
