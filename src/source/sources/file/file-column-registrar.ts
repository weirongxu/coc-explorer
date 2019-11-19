import { FileNode, FileSource } from './file-source';
import { config } from '../../../util';
import { Column, ColumnRegistrar } from '../../column-registrar';

export type FileColumns =
  | 'git'
  | 'selection'
  | 'clip'
  | 'diagnosticWarning'
  | 'diagnosticError'
  | 'indent'
  | 'indentLine'
  | 'icon'
  | 'filename'
  | 'size'
  | 'modified'
  | 'created'
  | 'accessed'
  | string;

export interface FileColumn extends Column<FileNode> {}

export class FileColumnRegistrar extends ColumnRegistrar<FileNode, FileSource, FileColumn> {
  getColumnConfig<T>(name: string, defaultValue?: T): T {
    return config.get('file.column.' + name, defaultValue)!;
  }
}

export const fileColumnRegistrar = new FileColumnRegistrar();
