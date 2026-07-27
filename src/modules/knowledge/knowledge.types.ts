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
  category: 'product' | 'faq' | 'policy' | 'skill';
  source: 'woocommerce' | 'manual';
  metadata?: Record<string, unknown>;
}
