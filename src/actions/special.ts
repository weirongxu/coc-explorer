import { BaseTreeNode, ExplorerSource } from '../source/source';

export const conditionActionRules: Record<
  string,
  {
    filter: (
      s: ExplorerSource<any>,
      n: BaseTreeNode<any>,
      args: string[],
    ) => boolean | undefined;
    getHelpDescription: (args: string[]) => string;
  }
> = {
  'expandable?': {
    filter: (_s, n) => n.expandable,
    getHelpDescription: () => 'expandable?',
  },
  'expanded?': {
    filter: (s, n) => s.isExpanded(n),
    getHelpDescription: () => 'expanded?',
  },
  'type?': {
    filter: (_s, n, args) => n.type === args[0],
    getHelpDescription: (args) => `type is ${args[0]}`,
  },
};

export const waitAction = {
  name: 'wait',
  helpDescription: '<wait>',
};
