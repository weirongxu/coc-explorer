import { config, normalizePath } from './util';
import { workspace } from 'coc.nvim';

const { nvim } = workspace;

export interface ArgsSource {
  name: string;
  expand: boolean;
}

export type ArgPosition = 'tab' | 'left' | 'right';

export interface Args {
  sources: ArgsSource[];
  toggle: boolean;
  width: number;
  position: ArgPosition;
  bufferColumns: string[];
  fileColumns: string[];
  revealPath: string;
  rootPath: string;
}

const boolTrueArgs = ['toggle', 'tab-isolate'];
const boolFalseArgs = boolTrueArgs.map((a) => 'no-' + a);

function parseSources(sources: string): ArgsSource[] {
  const sourceArray = sources.split(',');
  return sourceArray.map((source) => {
    let expand = false;
    let name: string;
    if (source.endsWith('+')) {
      expand = true;
      name = source.slice(0, source.length - 1);
    } else if (source.endsWith('-')) {
      expand = false;
      name = source.slice(0, source.length - 1);
    } else {
      name = source;
    }
    return {
      name,
      expand,
    };
  });
}

async function getRootPath() {
  let useGetcwd = false;
  const buftype = await nvim.getVar('&buftype');
  if (buftype === 'nofile') {
    useGetcwd = true;
  } else {
    const bufname = await nvim.call('bufname', ['%']);
    if (!bufname) {
      useGetcwd = true;
    }
  }
  return useGetcwd ? ((await nvim.call('getcwd', [])) as string) : workspace.rootPath;
}

export async function parseArgs(args: string[]): Promise<Args> {
  const { nvim } = workspace;

  const parsedArgs: Args = {
    sources: config.get<ArgsSource[]>('sources')!,
    toggle: config.get<boolean>('toggle')!,
    width: config.get<number>('width')!,
    position: config.get<ArgPosition>('position')!,
    bufferColumns: config.get<string[]>('buffer.columns')!,
    fileColumns: config.get<string[]>('file.columns')!,
    rootPath: '',
    revealPath: '',
  };

  while (args.length > 0) {
    const arg = args.shift()!;
    if (arg.startsWith('--')) {
      let key: string | undefined;
      let value: string | boolean | undefined;
      if (arg.includes('=')) {
        [key, value] = arg.slice(2).split('=', 2);
      } else {
        key = arg.slice(2);

        if (boolTrueArgs.includes(key)) {
          value = true;
        } else if (boolFalseArgs.includes(key)) {
          key = key.slice(3);
          value = false;
        } else if (args.length > 0) {
          value = args.shift()!;
        }
      }

      if (key !== undefined && value !== undefined) {
        if (key === 'sources') {
          parsedArgs.sources = parseSources(value as string);
        } else if (key === 'reveal') {
          parsedArgs.revealPath = value as string;
        } else if (key === 'toggle') {
          parsedArgs.toggle = value as boolean;
        } else if (key === 'width') {
          parsedArgs.width = parseInt(value as string, 10);
        } else if (key === 'position') {
          parsedArgs.position = value as ArgPosition;
        } else if (key === 'buffer-columns') {
          parsedArgs.bufferColumns = (value as string).split(',');
        } else if (key === 'file-columns') {
          parsedArgs.fileColumns = (value as string).split(',');
        }
      } else {
        parsedArgs.rootPath = arg;
      }
    } else {
      parsedArgs.rootPath = arg;
    }
  }

  if (!parsedArgs.revealPath) {
    parsedArgs.revealPath = (await nvim.call('expand', '%:p')) as string;
  }
  if (!parsedArgs.rootPath) {
    parsedArgs.rootPath = await getRootPath();
  }

  parsedArgs.revealPath = normalizePath(parsedArgs.revealPath);
  parsedArgs.rootPath = normalizePath(parsedArgs.rootPath);

  return parsedArgs;
}
