import { workspace, Window } from 'coc.nvim';
import { Notifier } from '.';

let _supportedSetbufline: boolean | undefined = undefined;
export async function supportedSetbufline() {
  if (_supportedSetbufline === undefined) {
    _supportedSetbufline = Boolean(
      await workspace.nvim.call('exists', ['*setbufline']),
    );
  }
  return _supportedSetbufline;
}

export function supportedFloat(): boolean {
  return workspace.floatSupported;
}
export function supportedNvimFloating() {
  return workspace.isNvim && supportedFloat();
}

export function supportedBufferHighlight() {
  return !workspace.env.isVim || workspace.env.textprop;
}

export async function enableWrapscan() {
  const wrapscan = await workspace.nvim.getOption('wrapscan');
  return !!wrapscan;
}

export async function displayWidth(str: string) {
  return (await workspace.nvim.call('strdisplaywidth', [str])) as number;
}

export async function displaySlice(str: string, start: number, end?: number) {
  return (await workspace.nvim.call('coc_explorer#strdisplayslice', [
    str,
    start,
    end ?? undefined,
  ])) as string;
}

export function closeWinByBufnrNotifier(bufnr: number) {
  return Notifier.create(() => {
    workspace.nvim.call('coc_explorer#close_win_by_bufnr', [bufnr], true);
  });
}

export async function winnrByBufnr(bufnr: number | undefined) {
  if (!bufnr) {
    return undefined;
  }
  return workspace.nvim.call('bufwinnr', bufnr).then((winnr: number) => {
    if (winnr > 0) {
      return winnr;
    } else {
      return undefined;
    }
  });
}

export async function winidByWinnr(winnr: number | undefined) {
  if (!winnr) {
    return undefined;
  }
  const winid = (await workspace.nvim.call('win_getid', winnr)) as number;
  if (winid >= 0) {
    return winid;
  } else {
    return undefined;
  }
}

export async function winidByBufnr(bufnr: number | undefined) {
  return winnrByBufnr(bufnr).then(async (winnr) => {
    if (winnr) {
      return winidByWinnr(winnr);
    } else {
      return undefined;
    }
  });
}

export function winByWinid(winid: number): Promise<Window>;
export function winByWinid(winid: undefined): Promise<undefined>;
export function winByWinid(
  winid: number | undefined,
): Promise<Window | undefined>;
export async function winByWinid(winid: number | undefined) {
  if (winid) {
    return workspace.nvim.createWindow(winid);
  } else {
    return undefined;
  }
}

export async function bufnrByWinnrOrWinid(winnrOrWinid: number | undefined) {
  if (!winnrOrWinid) {
    return undefined;
  }
  const bufnr = (await workspace.nvim.call('winbufnr', winnrOrWinid)) as number;
  if (bufnr >= 0) {
    return bufnr;
  } else {
    return undefined;
  }
}

export async function prompt(msg: string): Promise<'yes' | 'no' | undefined>;
export async function prompt<T extends string>(
  msg: string,
  choices: T[],
  defaultChoice?: T,
): Promise<T | undefined>;
export async function prompt(
  msg: string,
  choices?: string[],
  defaultChoice?: string,
): Promise<string | undefined> {
  if (!choices) {
    choices = ['yes', 'no'];
    defaultChoice = 'no';
  }
  const defaultNumber = defaultChoice ? choices.indexOf(defaultChoice) : -1;
  const result = (await workspace.nvim.call('confirm', [
    msg,
    choices
      .map((choice) => {
        let index = [...choice].findIndex((ch) => /[A-Z]/.test(ch));
        if (index === -1) {
          index = 0;
        }
        return (
          choice.slice(0, index) +
          '&' +
          choice[index].toUpperCase() +
          choice.slice(index + 1)
        );
      })
      .join('\n'),
    defaultNumber + 1,
  ])) as number;
  if (result === 0) {
    return;
  } else {
    return choices[result - 1];
  }
}

export type InputCompletion =
  | undefined
  | 'arglist'
  | 'augroup'
  | 'buffer'
  | 'behave'
  | 'color'
  | 'command'
  | 'compiler'
  | 'cscope'
  | 'dir'
  | 'environment'
  | 'event'
  | 'expression'
  | 'file'
  | 'file_in_path'
  | 'filetype'
  | 'function'
  | 'help'
  | 'highlight'
  | 'history'
  | 'locale'
  | 'mapclear'
  | 'mapping'
  | 'menu'
  | 'messages'
  | 'option'
  | 'packadd'
  | 'shellcmd'
  | 'sign'
  | 'syntax'
  | 'syntime'
  | 'tag'
  | 'tag_listfiles'
  | 'user'
  | 'var'
  | string;

export async function input(
  prompt: string,
  defaultInput = '',
  completion: InputCompletion = undefined,
): Promise<string> {
  return workspace.nvim.callAsync('coc#util#with_callback', [
    'input',
    [prompt, defaultInput, completion],
  ]);
}
