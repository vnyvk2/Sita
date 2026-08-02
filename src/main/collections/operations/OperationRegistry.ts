import type { CollectionOperation, OperationType } from './types';

export class OperationRegistry {
  private readonly operations = new Map<OperationType, CollectionOperation<any, any>>();

  public register(type: OperationType, operation: CollectionOperation<any, any>): void {
    if (this.operations.has(type)) {
      throw new Error(`Operation for type '${type}' is already registered.`);
    }
    this.operations.set(type, operation);
  }

  public get(type: OperationType): CollectionOperation<any, any> {
    const op = this.operations.get(type);
    if (!op) {
      throw new Error(`Operation for type '${type}' not found in registry.`);
    }
    return op;
  }
}
