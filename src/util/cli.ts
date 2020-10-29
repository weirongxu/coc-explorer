import { spawn, SpawnOptionsWithoutStdio } from 'child_process';
import which from 'which';

export const execCli = (
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

export const executable = async (cmd: string): Promise<boolean> => {
  try {
    await which(cmd);
  } catch (e) {
    return false;
  }
  return true;
};
