import { workspace } from 'coc.nvim';

const { nvim } = workspace;

let _supportSetbufline: boolean | null = null;
export async function supportSetbufline() {
  if (_supportSetbufline === null) {
    _supportSetbufline = Boolean(await nvim.call('exists', ['*setbufline']));
  }
  return _supportSetbufline;
}

export function supportBufferHighlight() {
  return !workspace.env.isVim || workspace.env.textprop;
}

export async function enableWrapscan() {
  const wrapscan = await nvim.getOption('wrapscan');
  return !!wrapscan;
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
  const result = (await nvim.call('confirm', [
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
) {
  const result = (await nvim.call('input', [prompt, defaultInput, completion])) as string;
  return result || null;
}
