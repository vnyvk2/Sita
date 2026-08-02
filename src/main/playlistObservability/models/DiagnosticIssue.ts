export type DiagnosticSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface DiagnosticIssue {
  id: string;
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  correlationId?: string;
  timestamp: Date;
}
