import { FileNode, FileSource } from './fileSource';
import { ColumnRegistrar } from '../../columnRegistrar';

export class FileColumnRegistrar extends ColumnRegistrar<
  FileNode,
  FileSource
> {}

export const fileColumnRegistrar = new FileColumnRegistrar();
