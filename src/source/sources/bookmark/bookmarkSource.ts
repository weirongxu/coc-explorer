import { workspace, extensions } from 'coc.nvim';
import { debounce } from '../../../util';
import { fsExists } from '../../../util';
import { hlGroupManager } from '../../highlightManager';
import { ExplorerSource, BaseTreeNode } from '../../source';
import { sourceManager } from '../../sourceManager';
import { bookmarkColumnRegistrar } from './bookmarkColumnRegistrar';
import './load';
import { initBookmarkActions } from './bookmarkActions';
import { SourcePainters } from '../../sourcePainters';
import { argOptions } from '../../../argOptions';
import path from 'path';
import pathLib from 'path';
import BookmarkDB from './util/db';
import { decode } from './util/fp';
import { onCocBookmarkChange } from '../../../events';

export interface BookmarkNode
  extends BaseTreeNode<BookmarkNode, 'root' | 'child'> {
  fullpath: string;
  filename: string;
  lnum: number;
  line: string;
  annotation: string | undefined;
}

interface BookmarkItem {
  line: string;
  filetype: string;
  annotation?: string;
}

const hl = hlGroupManager.linkGroup.bind(hlGroupManager);

export const bookmarkHighlights = {
  title: hl('BookmarkRoot', 'Constant'),
  expandIcon: hl('BookmarkExpandIcon', 'Directory'),
  filename: hl('BookmarkFilename', 'String'),
  fullpath: hl('BookmarkFullpath', 'Special'),
  position: hl('BookmarkPosition', 'Comment'),
  line: hlGroupManager.group(
    'BookmarkLine',
    'ctermbg=27 ctermfg=0 guibg=#1593e5 guifg=#ffffff',
  ),
  annotation: hl('BookmarkAnnotation', 'Comment'),
};

export class BookmarkSource extends ExplorerSource<BookmarkNode> {
  hlSrcId = workspace.createNameSpace('coc-explorer-bookmark');
  rootNode: BookmarkNode = {
    type: 'root',
    isRoot: true,
    expandable: true,
    uid: this.helper.getUid('0'),
    fullpath: '',
    filename: '',
    lnum: -1,
    line: '',
    annotation: undefined,
  };
  sourcePainters: SourcePainters<BookmarkNode> = new SourcePainters<
    BookmarkNode
  >(this, bookmarkColumnRegistrar);

  static get enabled(): boolean | Promise<boolean> {
    return extensions.getExtensionState('coc-bookmark') === 'activated';
  }

  async init() {
    if (this.config.get('activeMode')) {
      this.subscriptions.push(
        onCocBookmarkChange(
          debounce(500, async () => {
            await this.reload(this.rootNode);
          }),
        ),
      );
    }

    initBookmarkActions(this);
  }

  async open() {
    await this.sourcePainters.parseTemplate(
      'root',
      await this.explorer.args.value(argOptions.bookmarkRootTemplate),
    );
    await this.sourcePainters.parseTemplate(
      'child',
      await this.explorer.args.value(argOptions.bookmarkChildTemplate),
      await this.explorer.args.value(argOptions.bookmarkChildLabelingTemplate),
    );

    const args = this.explorer.args;
    this.rootNode.fullpath = await args.value(argOptions.rootUri);
  }

  async loadChildren(parentNode: BookmarkNode) {
    const extRoot = workspace.env.extensionRoot;
    const bookmarkPath = path.join(extRoot, 'coc-bookmark-data/bookmark.json');
    const db = new BookmarkDB(bookmarkPath);
    const data = (await db.load()) as Object;

    const bookmarkNodes = [] as BookmarkNode[];
    for (const [filepath, bookmarks] of Object.entries(data)) {
      const fullpath = decode(filepath);
      if (
        fullpath.startsWith(parentNode.fullpath) &&
        (await fsExists(fullpath))
      ) {
        for (const lnum of Object.keys(bookmarks).sort(
          (l1, l2) => Number(l1) - Number(l2),
        )) {
          const bookmark: BookmarkItem = bookmarks[lnum];
          bookmarkNodes.push({
            type: 'child',
            uid: this.helper.getUid(fullpath + lnum),
            fullpath,
            filename: pathLib.basename(fullpath),
            lnum: Number(lnum),
            line: bookmark.line,
            annotation: bookmark.annotation?.toString(),
          });
        }
      }
    }
    return bookmarkNodes;
  }
}

sourceManager.registerSource('bookmark', BookmarkSource);
