import { BufferItem, BufferSource } from './buffer-source';
import { config } from '../../../util';
import { ColumnDraw, BaseColumnManager } from '../../base-column-manager';

export type BufferColumn =
  | 'selection'
  | 'bufname'
  | 'modified'
  | 'bufnr'
  | string;

export interface BufferColumnDraw extends ColumnDraw<BufferItem> {}

class BufferColumnManager extends BaseColumnManager<
  BufferItem,
  BufferSource,
  BufferColumnDraw
> {}

export const bufferColumnManager = new BufferColumnManager(
  config.get<BufferColumn[]>('buffer.columns')!,
);
