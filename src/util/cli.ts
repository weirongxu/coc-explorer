import {
  spawn,
  exec,
  SpawnOptionsWithoutStdio,
  ExecOptions,
} from 'child_process';
import which from 'which';

export const execCmd = (
  name: string,
  args: string[],
  options?: SpawnOptionsWithoutStdio,
) => {
  const streams = spawn(name, args, options);

  let output = '';
  streams.stdout.on('data', (data: Buffer) => {
    output += data.toString();
  });
  return new Promise<string>((resolve, reject) => {
    streams.stdout.on('error', (error) => {
      reject(error);
    });
    streams.stdout.on('end', () => {
      resolve(output);
    });
  });
};

export const execCmdLine = (command: string, options?: ExecOptions) => {
  return new Promise<string>((resolve, reject) => {
    exec(command, options, (error, stdout) => {
      if (error) {
        return reject(error);
      }
      resolve(stdout.toString('utf8'));
    });
  });
};

export function shellescape(s: string): string {
  if (process.platform === 'win32') {
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  if (/[^A-Za-z0-9_\/:=-]/.test(s)) {
    s = "'" + s.replace(/'/g, "'\\''") + "'";
    s = s
      .replace(/^(?:'')+/g, '') // unduplicate single-quote at the beginning
      .replace(/\\'''/g, "\\'"); // remove non-escaped single-quote if there are enclosed between 2 escaped
    return s;
  }
  return s;
}

export const executable = async (cmd: string): Promise<boolean> => {
  try {
    await which(cmd);
  } catch (e) {
    return false;
  }
  return true;
};
