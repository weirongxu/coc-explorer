import { BufferNode, BufferSource } from './buffer-source';
import { Column, ColumnRegistrar } from '../../column-registrar';
import { config } from '../../../util';

export type BufferColumns = 'selection' | 'bufname' | 'modified' | 'bufnr' | string;

export interface BufferColumn extends Column<BufferNode> {}

class BufferColumnRegistrar extends ColumnRegistrar<BufferNode, BufferSource, BufferColumn> {
  getColumnConfig<T>(name: string, defaultValue?: T): T {
    return config.get('buffer.column.' + name, defaultValue)!;
  }
}

export const bufferColumnRegistrar = new BufferColumnRegistrar();
