import { FileNode, FileSource } from './file-source';
import { config } from '../../../util';
import { ColumnRegistrar } from '../../column-registrar';

// TODO support root column
export class FileColumnRegistrar extends ColumnRegistrar<FileNode, FileSource> {
  getColumnConfig<T>(name: string, defaultValue?: T): T {
    return config.get('file.column.' + name, defaultValue)!;
  }
}

export const fileColumnRegistrar = new FileColumnRegistrar();
