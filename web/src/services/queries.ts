import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './apiClient';
import {
  Agent,
  ConversationDetail,
  ConversationListResponse,
  ConversationStatus,
  DashboardStats,
  KnowledgeCategory,
  KnowledgeDoc,
  SyncResult,
} from '../lib/types';

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardStats>('/admin/dashboard'),
  });
}

export function useConversations(status: string, page: number, limit = 20) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status) params.set('status', status);
  return useQuery({
    queryKey: ['conversations', status, page, limit],
    queryFn: () => api.get<ConversationListResponse>(`/admin/conversations?${params.toString()}`),
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: ['conversation', id],
    queryFn: () => api.get<ConversationDetail>(`/admin/conversations/${id}`),
    enabled: !!id,
  });
}

export function useReply(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: string) =>
      api.post<{ success: boolean }>(`/admin/conversations/${id}/reply`, { message }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversation', id] }),
  });
}

export function useCloseConversation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.patch<{ success: boolean }>(`/admin/conversations/${id}/close`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation', id] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useKnowledge(category: string) {
  const qs = category ? `?category=${category}` : '';
  return useQuery({
    queryKey: ['knowledge', category],
    queryFn: () => api.get<{ docs: KnowledgeDoc[] }>(`/admin/knowledge${qs}`),
  });
}

interface CreateDocInput { title: string; content: string; category: KnowledgeCategory; }

export function useCreateDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDocInput) => api.post('/admin/knowledge', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge'] }),
  });
}

export function useUpdateDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; title?: string; content?: string }) =>
      api.put(`/admin/knowledge/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge'] }),
  });
}

export function useDeleteDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/admin/knowledge/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge'] }),
  });
}

export function useSyncWoo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<SyncResult>('/admin/knowledge/sync'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge'] }),
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: (creds: { email: string; password: string }) =>
      api.post<{ token: string; agent: Agent }>('/admin/login', creds),
  });
}

export type { ConversationStatus };
