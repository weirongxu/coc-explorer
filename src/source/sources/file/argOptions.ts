import { config } from '../../../config';
import { Args } from '../../../parseArgs';

export const fileArgOptions = {
  fileRootTemplate: Args.registerOption<string>('file-root-template', {
    getDefault: () => config.get<string>('file.root.template')!,
  }),
  fileRootLabelingTemplate: Args.registerOption<string>(
    'file-root-labeling-template',
    {
      getDefault: () => config.get<string>('file.root.labelingTemplate')!,
    },
  ),
  fileChildTemplate: Args.registerOption<string>('file-child-template', {
    getDefault: () => config.get<string>('file.child.template')!,
  }),
  fileChildLabelingTemplate: Args.registerOption<string>(
    'file-child-labeling-template',
    {
      getDefault: () => config.get<string>('file.child.labelingTemplate')!,
    },
  ),
};
