import { config } from '../../../config';
import { Args } from '../../../arg/parseArgs';

export const bookmarkArgOptions = {
  bookmarkRootTemplate: Args.registerOption<string>('bookmark-root-template', {
    getDefault: () => config.get<string>('bookmark.root.template')!,
  }),
  bookmarkChildTemplate: Args.registerOption<string>(
    'bookmark-child-template',
    {
      getDefault: () => config.get<string>('bookmark.child.template')!,
    },
  ),
  bookmarkChildLabelingTemplate: Args.registerOption<string>(
    'bookmark-child-labeling-template',
    {
      getDefault: () => config.get<string>('bookmark.child.labelingTemplate')!,
    },
  ),
};
