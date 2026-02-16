export type OllamaRole = "system" | "user" | "assistant" | "tool";

export interface OllamaMessage {
  role: OllamaRole;
  content: string;
  images?: string[];
  tool_calls?: Array<Record<string, unknown>>;
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  format?: "json" | Record<string, unknown>;
  stream?: false;
  options?: {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    [key: string]: unknown;
  };
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export interface OllamaVisionRequest {
  model: string;
  prompt: string;
  images: string[];
  stream?: false;
  options?: Record<string, unknown>;
}

export interface OllamaVisionResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
}

export interface OllamaEmbeddingRequest {
  model: string;
  input: string | string[];
  truncate?: boolean;
}

export interface OllamaEmbeddingResponse {
  model: string;
  embeddings: number[][];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
}

export interface CircuitBreakerState {
  open: boolean;
  failureCount: number;
  openedAt?: number;
}

export interface OllamaClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerResetMs?: number;
  fetchImpl?: typeof fetch;
  onCircuitOpen?: (state: CircuitBreakerState) => void;
}

export class OllamaClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly backoffMs: number;
  private readonly circuitBreakerThreshold: number;
  private readonly circuitBreakerResetMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly onCircuitOpen?: (state: CircuitBreakerState) => void;

  private state: CircuitBreakerState = {
    open: false,
    failureCount: 0,
  };

  constructor(options: OllamaClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.retries = options.retries ?? 2;
    this.backoffMs = options.backoffMs ?? 500;
    this.circuitBreakerThreshold = options.circuitBreakerThreshold ?? 5;
    this.circuitBreakerResetMs = options.circuitBreakerResetMs ?? 30_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.onCircuitOpen = options.onCircuitOpen;
  }

  async chat(request: OllamaChatRequest): Promise<OllamaChatResponse> {
    return this.request<OllamaChatResponse>("/api/chat", request);
  }

  async vision(request: OllamaVisionRequest): Promise<OllamaVisionResponse> {
    return this.request<OllamaVisionResponse>("/api/generate", request);
  }

  async embed(request: OllamaEmbeddingRequest): Promise<OllamaEmbeddingResponse> {
    return this.request<OllamaEmbeddingResponse>("/api/embed", request);
  }

  private async request<TResponse>(path: string, payload: unknown): Promise<TResponse> {
    this.resetCircuitIfExpired();
    if (this.state.open) {
      throw new Error("Ollama circuit breaker is open");
    }

    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.retries) {
      try {
        const response = await this.fetchWithTimeout(`${this.baseUrl}${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Ollama request failed (${response.status}): ${text}`);
        }

        this.onSuccess();
        return (await response.json()) as TResponse;
      } catch (error) {
        lastError = error;
        attempt += 1;
        this.onFailure();

        if (attempt > this.retries || this.state.open) {
          break;
        }

        await this.wait(this.backoffMs * attempt);
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Unknown Ollama client error");
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort("timeout"), this.timeoutMs);

    try {
      return await this.fetchImpl(url, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private onSuccess(): void {
    this.state = { open: false, failureCount: 0 };
  }

  private onFailure(): void {
    const failureCount = this.state.failureCount + 1;
    if (failureCount >= this.circuitBreakerThreshold) {
      this.state = {
        open: true,
        failureCount,
        openedAt: Date.now(),
      };
      this.onCircuitOpen?.(this.state);
      return;
    }

    this.state = {
      open: false,
      failureCount,
    };
  }

  private resetCircuitIfExpired(): void {
    if (!this.state.open || !this.state.openedAt) {
      return;
    }

    if (Date.now() - this.state.openedAt >= this.circuitBreakerResetMs) {
      this.state = {
        open: false,
        failureCount: 0,
      };
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
