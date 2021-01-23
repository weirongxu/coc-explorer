import { FilenameHighlight } from '../../../../highlight/filename';
import { bufferColumnRegistrar } from '../bufferColumnRegistrar';
import { bufferHighlights } from '../bufferSource';

bufferColumnRegistrar.registerColumn('child', 'name', ({ source }) => {
  const filenameHighlight = new FilenameHighlight(source.config);

  const getHighlight = (fullpath: string, visible: boolean) => {
    return (
      filenameHighlight.getHighlight(fullpath, false, [
        'diagnosticError',
        'diagnosticWarning',
        'git',
      ]) ?? (visible ? bufferHighlights.nameVisible : undefined)
    );
  };

  return {
    draw() {
      return {
        drawNode(row, { node }) {
          row.add(node.name, {
            hl: getHighlight(node.fullpath, node.visible),
          });
        },
      };
    },
  };
});
