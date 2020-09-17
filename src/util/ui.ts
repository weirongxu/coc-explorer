import type { FloatInputType } from 'coc-floatinput';
import { extensions, workspace } from 'coc.nvim';
import { config } from '../config';

let floatInputApi: FloatInputType | undefined;

async function getFloatInputApi() {
  if (!floatInputApi) {
    floatInputApi = extensions.getExtensionApi(
      'coc-floatinput',
    ) as FloatInputType;
  }
  return floatInputApi;
}

async function getFloatUI() {
  if (!config.get<boolean>('enableFloatinput')!) {
    return undefined;
  }
  return (await getFloatInputApi())?.FloatingUI;
}

export async function vimPrompt(msg: string): Promise<'yes' | 'no' | undefined>;
export async function vimPrompt<T extends string>(
  msg: string,
  choices: T[],
  defaultChoice?: T,
): Promise<T | undefined>;
export async function vimPrompt(
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
  const FloatUI = await getFloatUI();
  if (FloatUI) {
    return FloatUI.confirm<any>({
      prompt: msg,
      values: choices,
      defaultValue: defaultChoice,
    });
  } else {
    return vimPrompt(msg, choices as string[], defaultChoice);
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

export async function vimInput(
  prompt: string,
  defaultInput = '',
  completion: InputCompletion = undefined,
): Promise<string> {
  return workspace.nvim.callAsync('coc#util#with_callback', [
    'input',
    [prompt + ' ', defaultInput, completion],
  ]);
}

export async function input(
  prompt: string,
  defaultInput = '',
  completion: InputCompletion = undefined,
): Promise<string> {
  const FloatUI = await getFloatUI();
  if (FloatUI) {
    return (
      (await FloatUI.stringInput({
        prompt,
        defaultValue: defaultInput,
        // TODO completion
      })) ?? ''
    );
  } else {
    return vimInput(prompt, defaultInput, completion);
  }
}
