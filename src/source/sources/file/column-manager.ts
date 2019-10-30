import { FileNode, FileSource } from './file-source';
import { config } from '../../../util';
import { ColumnDraw, BaseColumnManager } from '../../base-column-manager';

export type FileColumn =
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

export interface FileColumnDraw extends ColumnDraw<FileNode> {}

class FileColumnManager extends BaseColumnManager<FileNode, FileSource, FileColumnDraw> {
  getColumnConfig<T>(name: string, defaultValue?: T): T {
    return config.get('file.column.' + name, defaultValue)!;
  }
}

export const fileColumnManager = new FileColumnManager(config.get<FileColumn[]>('file.columns')!);
