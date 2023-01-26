import type { BookmarkNode, BookmarkSource } from './bookmarkSource';
import { ColumnRegistrar } from '../../columnRegistrar';

class BookmarkColumnRegistrar extends ColumnRegistrar<
  BookmarkNode,
  BookmarkSource
> {}

export const bookmarkColumnRegistrar = new BookmarkColumnRegistrar();
