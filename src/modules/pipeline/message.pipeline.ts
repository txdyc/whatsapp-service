import type { ConversationService } from '../conversation/conversation.service.js';
import type { SessionService } from '../conversation/session.service.js';
import type { KnowledgeService } from '../knowledge/knowledge.service.js';
import type { LLMProvider } from '../ai/llm.types.js';
import type { PromptBuilder } from '../ai/prompt.builder.js';
import type { WhatsAppService } from '../whatsapp/whatsapp.service.js';
import type { HandoffService } from '../handoff/handoff.service.js';
import type { IncomingMessage } from '../whatsapp/whatsapp.types.js';
import { logger } from '../../common/logger.js';

interface PipelineDeps {
  conversationService: ConversationService;
  sessionService: SessionService;
  knowledgeService: KnowledgeService;
  llmProvider: LLMProvider;
  promptBuilder: PromptBuilder;
  whatsappService: WhatsAppService;
  handoffService: HandoffService;
  socketEmit: (event: string, data: unknown) => void;
}

export class MessagePipeline {
  constructor(private deps: PipelineDeps) {}

  async process(incoming: IncomingMessage): Promise<void> {
    const {
      conversationService,
      sessionService,
      knowledgeService,
      llmProvider,
      promptBuilder,
      whatsappService,
      handoffService,
      socketEmit,
    } = this.deps;

    // 1. Find or create conversation
    const conversation = await conversationService.findOrCreateConversation(
      incoming.from,
      incoming.contactName,
      incoming.from
    );

    // 2. Save user message to DB
    await conversationService.addMessage(conversation.id, 'user', incoming.text, incoming.waMessageId);

    // 3. Update session cache
    await sessionService.addMessage(conversation.id, { role: 'user', content: incoming.text });

    // 4. If conversation is in human mode, just save message (agent sees it in dashboard)
    if (conversation.status === 'human') {
      socketEmit('new_message', {
        conversationId: conversation.id,
        message: { role: 'user', content: incoming.text },
      });
      logger.info({ conversationId: conversation.id }, 'Message saved for human agent');
      return;
    }

    // 5. Get session history
    const history = await sessionService.getMessages(conversation.id);

    // 6. Search knowledge base for relevant context
    const knowledgeContext = await knowledgeService.searchSimilar(incoming.text, 5);

    // 7. Build LLM prompt
    const messages = promptBuilder.build(knowledgeContext, history, incoming.text);

    // 8. Call LLM
    let llmResponse;
    try {
      llmResponse = await llmProvider.complete(messages);
    } catch (error) {
      logger.error({ error }, 'LLM call failed, triggering handoff');
      const fallbackMsg = "Sorry, I'm having trouble right now. Let me connect you with a team member.";
      await whatsappService.sendTextMessage(incoming.from, fallbackMsg);
      await handoffService.executeHandoff(conversation.id, incoming.from);
      return;
    }

    // 9. Check if handoff is needed
    if (handoffService.shouldHandoff(llmResponse.content, incoming.text)) {
      await handoffService.executeHandoff(conversation.id, incoming.from);
      return;
    }

    // 10. Send AI response via WhatsApp
    await whatsappService.sendTextMessage(incoming.from, llmResponse.content);

    // 11. Save bot message to DB and session
    await conversationService.addMessage(conversation.id, 'bot', llmResponse.content);
    await sessionService.addMessage(conversation.id, { role: 'bot', content: llmResponse.content });
  }
}
