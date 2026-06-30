import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessagePipeline } from '../../../src/modules/pipeline/message.pipeline.js';

describe('MessagePipeline', () => {
  let pipeline: MessagePipeline;
  let deps: any;

  beforeEach(() => {
    deps = {
      conversationService: {
        findOrCreateConversation: vi.fn().mockResolvedValue({ id: 'conv-1', status: 'ai' }),
        addMessage: vi.fn().mockResolvedValue({ id: 'msg-1' }),
        updateStatus: vi.fn(),
      },
      sessionService: {
        getMessages: vi.fn().mockResolvedValue([]),
        addMessage: vi.fn(),
      },
      knowledgeService: {
        searchSimilar: vi.fn().mockResolvedValue([
          { id: 'doc-1', title: 'Widget', content: 'A great widget', category: 'product', similarity: 0.9 },
        ]),
      },
      llmProvider: {
        complete: vi.fn().mockResolvedValue({ content: 'Here is info about the widget!' }),
      },
      promptBuilder: {
        build: vi.fn().mockReturnValue([
          { role: 'system', content: 'You are...' },
          { role: 'user', content: 'Tell me about widgets' },
        ]),
      },
      whatsappService: {
        sendTextMessage: vi.fn(),
      },
      handoffService: {
        shouldHandoff: vi.fn().mockReturnValue(false),
        executeHandoff: vi.fn(),
      },
      socketEmit: vi.fn(),
    };
    pipeline = new MessagePipeline(deps);
  });

  it('should process message through full pipeline: AI response', async () => {
    await pipeline.process({
      waMessageId: 'wamid.123',
      from: '+1234567890',
      contactName: 'John',
      text: 'Tell me about widgets',
      timestamp: '1700000000',
    });

    expect(deps.conversationService.findOrCreateConversation).toHaveBeenCalledWith(
      '+1234567890', 'John', '+1234567890'
    );
    expect(deps.conversationService.addMessage).toHaveBeenCalledWith('conv-1', 'user', 'Tell me about widgets', 'wamid.123');
    expect(deps.sessionService.getMessages).toHaveBeenCalledWith('conv-1');
    expect(deps.knowledgeService.searchSimilar).toHaveBeenCalledWith('Tell me about widgets', 5);
    expect(deps.promptBuilder.build).toHaveBeenCalled();
    expect(deps.llmProvider.complete).toHaveBeenCalled();
    expect(deps.handoffService.shouldHandoff).toHaveBeenCalledWith('Here is info about the widget!', 'Tell me about widgets');
    expect(deps.whatsappService.sendTextMessage).toHaveBeenCalledWith('+1234567890', 'Here is info about the widget!');
    expect(deps.conversationService.addMessage).toHaveBeenCalledWith('conv-1', 'bot', 'Here is info about the widget!');
    expect(deps.sessionService.addMessage).toHaveBeenCalledTimes(2);
  });

  it('should trigger handoff when AI returns [HANDOFF]', async () => {
    deps.llmProvider.complete.mockResolvedValue({ content: '[HANDOFF] I cannot help with refunds.' });
    deps.handoffService.shouldHandoff.mockReturnValue(true);

    await pipeline.process({
      waMessageId: 'wamid.456',
      from: '+1234567890',
      contactName: 'John',
      text: 'I want a refund',
      timestamp: '1700000000',
    });

    expect(deps.handoffService.executeHandoff).toHaveBeenCalledWith('conv-1', '+1234567890');
    expect(deps.whatsappService.sendTextMessage).not.toHaveBeenCalledWith(
      '+1234567890',
      expect.stringContaining('[HANDOFF]')
    );
  });

  it('should skip AI processing for conversations in human status', async () => {
    deps.conversationService.findOrCreateConversation.mockResolvedValue({ id: 'conv-1', status: 'human' });

    await pipeline.process({
      waMessageId: 'wamid.789',
      from: '+1234567890',
      contactName: 'John',
      text: 'Hello agent',
      timestamp: '1700000000',
    });

    expect(deps.conversationService.addMessage).toHaveBeenCalled();
    expect(deps.llmProvider.complete).not.toHaveBeenCalled();
    expect(deps.whatsappService.sendTextMessage).not.toHaveBeenCalled();
  });

  it('emits new_message when conversation is in human mode', async () => {
    deps.conversationService.findOrCreateConversation.mockResolvedValue({ id: 'conv-1', status: 'human' });

    await pipeline.process({
      waMessageId: 'wamid.999',
      from: '+1234567890',
      contactName: 'John',
      text: 'Hello agent',
      timestamp: '1700000000',
    });

    expect(deps.socketEmit).toHaveBeenCalledWith(
      'new_message',
      expect.objectContaining({
        conversationId: 'conv-1',
        message: { role: 'user', content: 'Hello agent' },
      })
    );
  });

  it('does NOT emit new_message when conversation is in ai mode', async () => {
    await pipeline.process({
      waMessageId: 'wamid.111',
      from: '+1234567890',
      contactName: 'John',
      text: 'Tell me about widgets',
      timestamp: '1700000000',
    });

    expect(deps.socketEmit).not.toHaveBeenCalled();
  });
});
