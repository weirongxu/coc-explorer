import { BaseTreeNode, ExplorerSource } from '../source/source';

export const conditionActionRules: Record<
  string,
  {
    filter: (
      s: ExplorerSource<any>,
      n: BaseTreeNode<any>,
      args: string[],
    ) => boolean | undefined;
    getDescription: (args: string[]) => string;
  }
> = {
  'expandable?': {
    filter: (_s, n) => n.expandable,
    getDescription: () => 'expandable?',
  },
  'expanded?': {
    filter: (s, n) => s.isExpanded(n),
    getDescription: () => 'expanded?',
  },
  'type?': {
    filter: (_s, n, args) => n.type === args[0],
    getDescription: (args) => `type is ${args[0]}`,
  },
};
