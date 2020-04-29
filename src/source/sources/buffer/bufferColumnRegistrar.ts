import { BufferNode, BufferSource } from './bufferSource';
import { ColumnRegistrar } from '../../columnRegistrar';
import { config } from '../../../util';

class BufferColumnRegistrar extends ColumnRegistrar<BufferNode, BufferSource> {
  getColumnConfig<T>(name: string, defaultValue?: T): T {
    return config.get('buffer.column.' + name, defaultValue)!;
  }
}

export const bufferColumnRegistrar = new BufferColumnRegistrar();
