import { OllamaClient } from "./ollamaClient";

export interface TenantVectorRecord {
  id: string;
  tenantId: string;
  sourceId: string;
  content: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}

export interface VectorStore {
  upsert(record: TenantVectorRecord): Promise<void>;
  query(tenantId: string, embedding: number[], limit: number): Promise<TenantVectorRecord[]>;
}

export interface RagOptions {
  embeddingModel: string;
  topK?: number;
}

export class RagService {
  private readonly topK: number;

  constructor(
    private readonly ollamaClient: OllamaClient,
    private readonly vectorStore: VectorStore,
    private readonly options: RagOptions,
  ) {
    this.topK = options.topK ?? 5;
  }

  async embedText(text: string): Promise<number[]> {
    const response = await this.ollamaClient.embed({
      model: this.options.embeddingModel,
      input: text,
    });

    const [firstEmbedding] = response.embeddings;
    if (!firstEmbedding) {
      throw new Error("Embedding response was empty");
    }

    return firstEmbedding;
  }

  async indexTenantRecord(input: {
    tenantId: string;
    sourceId: string;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const embedding = await this.embedText(input.content);

    await this.vectorStore.upsert({
      id: `${input.tenantId}:${input.sourceId}`,
      tenantId: input.tenantId,
      sourceId: input.sourceId,
      content: input.content,
      embedding,
      metadata: input.metadata,
    });
  }

  async retrieveTenantContext(tenantId: string, query: string, limit = this.topK): Promise<TenantVectorRecord[]> {
    const queryEmbedding = await this.embedText(query);
    const records = await this.vectorStore.query(tenantId, queryEmbedding, limit);

    return records.filter((record) => record.tenantId === tenantId);
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Embedding vectors must have matching dimensions");
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  if (magA === 0 || magB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export class InMemoryTenantVectorStore implements VectorStore {
  private readonly records = new Map<string, TenantVectorRecord>();

  async upsert(record: TenantVectorRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  async query(tenantId: string, embedding: number[], limit: number): Promise<TenantVectorRecord[]> {
    return [...this.records.values()]
      .filter((record) => record.tenantId === tenantId)
      .map((record) => ({
        record,
        score: cosineSimilarity(record.embedding, embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ record }) => record);
  }
}
