import { BaseIndexes } from './base-indexes';
import { FileSource } from '../source/sources/file/file-source';

export class DiagnosticIndexes extends BaseIndexes {
  constructor(public fileSource: FileSource) {
    super();
  }

  updateDiagnostics() {}
}
