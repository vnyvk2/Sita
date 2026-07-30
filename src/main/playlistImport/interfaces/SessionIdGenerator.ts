export interface SessionIdGenerator {
  generateId(): string;
}

export class DefaultSessionIdGenerator implements SessionIdGenerator {
  generateId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }
}
