import { config } from '../../../config';
import { Args } from '../../../parseArgs';

export const bufferArgOptions = {
  bufferRootTemplate: Args.registerOption<string>('buffer-root-template', {
    getDefault: () => config.get<string>('buffer.root.template')!,
  }),
  bufferChildTemplate: Args.registerOption<string>('buffer-child-template', {
    getDefault: () => config.get<string>('buffer.child.template')!,
  }),
  bufferChildLabelingTemplate: Args.registerOption<string>(
    'buffer-child-labeling-template',
    {
      getDefault: () => config.get<string>('buffer.child.labelingTemplate')!,
    },
  ),
};
