import { spawn, SpawnOptionsWithoutStdio } from 'child_process';

export const execCli = (name: string, args: string[], options?: SpawnOptionsWithoutStdio) => {
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
