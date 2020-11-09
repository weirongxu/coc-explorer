import { filenameHighlight } from '../../../highlights/filename';
import { bufferColumnRegistrar } from '../bufferColumnRegistrar';
import { bufferHighlights } from '../bufferSource';

bufferColumnRegistrar.registerColumn('child', 'name', () => {
  const getHighlight = (fullpath: string, visible: boolean) => {
    return (
      filenameHighlight.getHighlight(fullpath, [
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
          row.add(node.basename, {
            hl: getHighlight(node.fullpath, node.visible),
          });
        },
      };
    },
  };
});
