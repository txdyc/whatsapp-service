export interface VectorSearchResult {
  id: string;
  title: string;
  content: string;
  category: string;
  similarity: number;
}

export interface CreateKnowledgeDocInput {
  title: string;
  content: string;
  category: 'product' | 'faq' | 'policy';
  source: 'woocommerce' | 'manual';
  metadata?: Record<string, unknown>;
}
