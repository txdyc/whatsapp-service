export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR'
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class WebhookVerificationError extends AppError {
  constructor(message: string = 'Webhook verification failed') {
    super(message, 401, 'WEBHOOK_VERIFICATION_FAILED');
  }
}

export class LLMError extends AppError {
  constructor(message: string, public provider: string) {
    super(message, 502, 'LLM_ERROR');
  }
}

export class HandoffError extends AppError {
  constructor(message: string) {
    super(message, 400, 'HANDOFF_ERROR');
  }
}
