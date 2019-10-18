import { FileItem, FileSource } from './file-source';
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

export interface FileColumnDraw extends ColumnDraw<FileItem> {}

class FileColumnManager extends BaseColumnManager<FileItem, FileSource, FileColumnDraw> {}

export const fileColumnManager = new FileColumnManager(config.get<FileColumn[]>('file.columns')!);
