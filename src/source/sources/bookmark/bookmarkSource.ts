import { extensions, workspace } from 'coc.nvim';
import pathLib from 'path';
import { argOptions } from '../../../argOptions';
import { internalEvents } from '../../../events';
import { debounce, fsExists, normalizePath } from '../../../util';
import { hlGroupManager } from '../../highlights/highlightManager';
import { BaseTreeNode, ExplorerSource } from '../../source';
import { sourceManager } from '../../sourceManager';
import { SourcePainters } from '../../sourcePainters';
import { bookmarkArgOptions } from './argOptions';
import { initBookmarkActions } from './bookmarkActions';
import { bookmarkColumnRegistrar } from './bookmarkColumnRegistrar';
import './load';
import BookmarkDB from './util/db';
import { decode } from './util/encodeDecode';

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
  hidden: hl('BookmarkHidden', 'Commment'),
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
      this.disposables.push(
        internalEvents.on(
          'CocBookmarkChange',
          debounce(500, async () => {
            await this.load(this.rootNode);
          }),
        ),
      );
    }

    initBookmarkActions(this);
  }

  async open() {
    await this.sourcePainters.parseTemplate(
      'root',
      await this.explorer.args.value(bookmarkArgOptions.bookmarkRootTemplate),
    );
    await this.sourcePainters.parseTemplate(
      'child',
      await this.explorer.args.value(bookmarkArgOptions.bookmarkChildTemplate),
      await this.explorer.args.value(
        bookmarkArgOptions.bookmarkChildLabelingTemplate,
      ),
    );

    this.rootNode.fullpath = this.explorer.rootUri;
  }

  async loadChildren(parentNode: BookmarkNode) {
    const extRoot = workspace.env.extensionRoot;
    const bookmarkPath = pathLib.join(
      extRoot,
      'coc-bookmark-data/bookmark.json',
    );
    const db = new BookmarkDB(bookmarkPath);
    const data = (await db.load()) as Object;

    const bookmarkNodes = [] as BookmarkNode[];
    for (const [filepath, bookmarks] of Object.entries(data)) {
      const fullpath = normalizePath(decode(filepath));
      if (
        (this.showHidden || fullpath.startsWith(parentNode.fullpath)) &&
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
