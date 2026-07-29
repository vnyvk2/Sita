import type { SmartPlaylistDefinition, SmartPlaylistRuleAST, RuleGroup, RuleCondition, OrderDefinition } from './ast';

export type JoinRelation = 'artist' | 'album' | 'genre';

export interface JoinPlan {
  relation: JoinRelation;
}

export interface ExecutionPlan {
  joins: JoinPlan[];
  rule: SmartPlaylistRuleAST;
  orderBy: OrderDefinition[];
}

export class QueryPlanner {
  public plan(definition: SmartPlaylistDefinition): ExecutionPlan {
    const requiredRelations = new Set<JoinRelation>();

    this.traverse(definition.rule, requiredRelations);

    for (const order of definition.orderBy) {
      this.checkField(order.field, requiredRelations);
    }

    const joins: JoinPlan[] = Array.from(requiredRelations).map((relation) => ({ relation }));

    // For deterministic SQL output, sort the joins so they are always in the same order
    joins.sort((a, b) => a.relation.localeCompare(b.relation));

    return {
      joins,
      rule: definition.rule,
      orderBy: definition.orderBy
    };
  }

  private traverse(node: SmartPlaylistRuleAST | RuleCondition, requiredRelations: Set<JoinRelation>) {
    if (node.type === 'group') {
      for (const child of node.rules) {
        this.traverse(child, requiredRelations);
      }
    } else if (node.type === 'condition') {
      this.checkField(node.field, requiredRelations);
    }
  }

  private checkField(field: string, requiredRelations: Set<JoinRelation>) {
    if (field === 'artist') {
      requiredRelations.add('artist');
    } else if (field === 'album') {
      requiredRelations.add('album');
    } else if (field === 'genre') {
      requiredRelations.add('genre');
    }
  }
}
