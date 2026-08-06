export interface UndoToken {
  id: string;
  operationId: string;
  timestamp: number;
  description: string;
  affectedResourceIds: (string | number)[];
}
