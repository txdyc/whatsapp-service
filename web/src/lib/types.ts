export type ConversationStatus = 'ai' | 'human' | 'closed';
export type MessageRole = 'user' | 'bot' | 'agent';
export type KnowledgeCategory = 'product' | 'faq' | 'policy';

export interface Agent {
  id: string;
  name: string;
  email?: string;
  role?: 'admin' | 'agent';
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  contactName: string | null;
  contactPhone: string;
  status: ConversationStatus;
  assignedAgentId: string | null;
  assignedAgent?: { id: string; name: string } | null;
  updatedAt: string;
  createdAt: string;
}

export interface ConversationDetail extends Conversation {
  messages: Message[];
}

export interface ConversationListResponse {
  conversations: Conversation[];
  total: number;
  page: number;
  limit: number;
}

export interface DashboardStats {
  totalConversations: number;
  todayConversations: number;
  activeAiConversations: number;
  activeHumanConversations: number;
  pendingHandoffs: number;
  todayMessages: number;
  aiResolutionRate: string;
}

export interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  category: KnowledgeCategory;
  source: 'woocommerce' | 'manual';
  createdAt: string;
  updatedAt: string;
}

export interface SyncResult {
  synced?: number;
  created?: number;
  updated?: number;
  [key: string]: unknown;
}
