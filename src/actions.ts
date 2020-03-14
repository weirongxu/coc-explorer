import { BaseTreeNode } from './source/source';

export const conditionActionRules: Record<
  string,
  {
    filter: (n: BaseTreeNode<any>, args: string[]) => boolean | undefined;
    getDescription: (args: string[]) => string;
  }
> = {
  'expandable?': {
    filter: (n) => n.expandable,
    getDescription: () => 'expandable?',
  },
  'type?': {
    filter: (n, args) => n.type === args[0],
    getDescription: (args) => `type is ${args[0]}`,
  },
};
