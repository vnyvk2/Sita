export type PromptMenuMode = 'dialog' | 'workspace';
export type PromptMenuScrollBehavior = 'panel' | 'content';

export interface PromptMenuDataOptions {
  mode?: PromptMenuMode;
  scrollBehavior?: PromptMenuScrollBehavior;
  className?: string;
}
