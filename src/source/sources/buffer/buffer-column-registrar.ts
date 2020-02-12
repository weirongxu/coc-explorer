import { BufferNode, BufferSource } from './buffer-source';
import { ColumnRegistrar } from '../../column-registrar';
import { config } from '../../../util';

class BufferColumnRegistrar extends ColumnRegistrar<BufferNode, BufferSource> {
  getColumnConfig<T>(name: string, defaultValue?: T): T {
    return config.get('buffer.column.' + name, defaultValue)!;
  }
}

export const bufferColumnRegistrar = new BufferColumnRegistrar();
