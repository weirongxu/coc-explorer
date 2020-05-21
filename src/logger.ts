import { Logger } from 'log4js';
import { workspace } from 'coc.nvim';
import { outputChannel } from './util';

type LoggerType = 'info' | 'warn' | 'error';

const loggerQueue: {
  type: LoggerType;
  data: any;
}[] = [];
let logger: undefined | Logger;
const loggerLog = (type: LoggerType, data: string | Error) => {
  if (logger) {
    if (type !== 'info') {
      const mtype = type === 'warn' ? 'warning' : type;
      // eslint-disable-next-line no-restricted-properties
      workspace.showMessage(data.toString(), mtype);
    }
    logger[type](data);
    if (typeof data === 'string') {
      outputChannel.appendLine(data);
    } else {
      outputChannel.appendLine(data.stack ?? data.toString());
    }
  }
};

export const log = (type: LoggerType, data: string | Error) => {
  if (logger) {
    loggerLog(type, data);
  } else {
    loggerQueue.push({
      type,
      data: data,
    });
  }
};

export const registerLogger = (logger_: Logger) => {
  logger = logger_;
  for (const q of loggerQueue) {
    loggerLog(q.type, q.data);
  }
};

export const onError = (error: Error) => {
  // eslint-disable-next-line no-restricted-syntax
  log('error', error);
};
