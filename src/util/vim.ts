import { workspace } from 'coc.nvim';

const nvim = () => workspace.nvim;

let _supportedSetbufline: boolean | null = null;
export async function supportedSetbufline() {
  if (_supportedSetbufline === null) {
    _supportedSetbufline = Boolean(await nvim().call('exists', ['*setbufline']));
  }
  return _supportedSetbufline;
}

export function supportedFloat(): boolean {
  // @ts-ignore
  return workspace.floatSupported;
}
export function supportedNvimFloating() {
  return workspace.isNvim && supportedFloat();
}

export function supportedBufferHighlight() {
  return !workspace.env.isVim || workspace.env.textprop;
}

export async function enableWrapscan() {
  const wrapscan = await nvim().getOption('wrapscan');
  return !!wrapscan;
}

export async function displayWidth(str: string) {
  return (await nvim().call('strdisplaywidth', [str])) as number;
}

export async function displaySlice(str: string, start: number, end?: number) {
  return (await nvim().call('coc_explorer#strdisplayslice', [str, start, end ?? null])) as string;
}

export async function winnrByBufnr(bufnr: number | null) {
  if (!bufnr) {
    return null;
  }
  return nvim()
    .call('bufwinnr', bufnr)
    .then((winnr: number) => {
      if (winnr > 0) {
        return winnr;
      } else {
        return null;
      }
    });
}

export async function winidByWinnr(winnr: number | null) {
  if (!winnr) {
    return null;
  }
  const winid = (await nvim().call('win_getid', winnr)) as number;
  if (winid >= 0) {
    return winid;
  } else {
    return null;
  }
}

export async function winidByBufnr(bufnr: number | null) {
  return winnrByBufnr(bufnr).then(async (winnr) => {
    if (winnr) {
      return winidByWinnr(winnr);
    } else {
      return null;
    }
  });
}

export async function winByWinid(winid: number | null) {
  if (winid) {
    return nvim().createWindow(winid);
  } else {
    return null;
  }
}

export async function prompt(msg: string): Promise<'yes' | 'no' | null>;
export async function prompt<T extends string>(
  msg: string,
  choices: T[],
  defaultChoice?: T,
): Promise<T | null>;
export async function prompt(
  msg: string,
  choices?: string[],
  defaultChoice?: string,
): Promise<string | null> {
  if (!choices) {
    choices = ['yes', 'no'];
    defaultChoice = 'no';
  }
  const defaultNumber = defaultChoice ? choices.indexOf(defaultChoice) : -1;
  const result = (await nvim().call('confirm', [
    msg,
    choices
      .map((choice) => {
        let index = [...choice].findIndex((ch) => /[A-Z]/.test(ch));
        if (index === -1) {
          index = 0;
        }
        return choice.slice(0, index) + '&' + choice[index].toUpperCase() + choice.slice(index + 1);
      })
      .join('\n'),
    defaultNumber + 1,
  ])) as number;
  if (result === 0) {
    return null;
  } else {
    return choices[result - 1] || null;
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
  return nvim().callAsync('coc#util#with_callback', ['input', [prompt, defaultInput, completion]]);
}
