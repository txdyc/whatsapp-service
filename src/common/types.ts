export { ConversationStatus, MessageRole, AgentRole, KnowledgeCategory, KnowledgeSource } from '@prisma/client';

export interface LLMResponse {
  content: string;
  handoff: boolean;
}

export interface EmbeddingResult {
  embedding: number[];
  model: string;
}

export interface VectorSearchResult {
  id: string;
  title: string;
  content: string;
  category: string;
  similarity: number;
}
