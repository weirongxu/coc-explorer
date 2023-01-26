import type { BufferNode, BufferSource } from './bufferSource';
import { ColumnRegistrar } from '../../columnRegistrar';

class BufferColumnRegistrar extends ColumnRegistrar<BufferNode, BufferSource> {}

export const bufferColumnRegistrar = new BufferColumnRegistrar();
