import { OllamaClient } from "./ollamaClient";

import type { RetrievalKind, SearchResultDto } from "../search/types";

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
  query(args: { tenantId: string; embedding: number[]; limit: number; kind: RetrievalKind }): Promise<SearchResultDto[]>;
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
      ...(input.metadata ? { metadata: input.metadata } : {}),
    });
  }

  async retrieveTenantContext(args: {
    tenantId: string;
    query: string;
    kind: RetrievalKind;
    limit?: number;
  }): Promise<SearchResultDto[]> {
    const queryEmbedding = await this.embedText(args.query);
    return this.vectorStore.query({
      tenantId: args.tenantId,
      embedding: queryEmbedding,
      limit: args.limit ?? this.topK,
      kind: args.kind,
    });
  }
}

export class ConvexVectorStoreAdapter implements VectorStore {
  constructor(
    private readonly retrieve: (args: {
      tenantId: string;
      embedding: number[];
      limit: number;
      kind: RetrievalKind;
    }) => Promise<SearchResultDto[]>,
    private readonly upsertHandler: (record: TenantVectorRecord) => Promise<void> = async () => {},
  ) {}

  async upsert(record: TenantVectorRecord): Promise<void> {
    await this.upsertHandler(record);
  }

  async query(args: { tenantId: string; embedding: number[]; limit: number; kind: RetrievalKind }): Promise<SearchResultDto[]> {
    return this.retrieve(args);
  }
}
