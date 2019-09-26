import fs from 'fs';
import { promisify } from 'util';
import rimraf from 'rimraf';
import trash from 'trash';
import pathLib from 'path';

export const fsOpen = promisify(fs.open);
export const fsClose = promisify(fs.close);
export const fsTouch = async (path: string) => await fsClose(await fsOpen(path, 'w'));
export const fsMkdir = promisify(fs.mkdir);
export const fsReaddir = promisify(fs.readdir);
export const fsReadlink = promisify(fs.readlink);
export const fsAccess = (path: string, mode?: number) =>
  new Promise<boolean>((resolve) => {
    fs.access(path, mode, (err) => {
      err ? resolve(false) : resolve(true);
    });
  });
export const fsExists = fsAccess;
export const fsStat = promisify(fs.stat);
export const fsLstat = promisify(fs.lstat);
export const fsCopyFile = promisify(fs.copyFile);
export const fsRename = promisify(fs.rename);
export const fsTrash = (paths: string | string[]) => trash(paths, { glob: false });
export const fsRimraf = promisify(rimraf);

export const copyFileOrDirectory = async (sourcePath: string, targetPath: string) => {
  const stat = await fsStat(sourcePath);
  if (stat.isDirectory()) {
    await fsMkdir(targetPath);
    const files = await fsReaddir(sourcePath);
    for (const filename of files) {
      await copyFileOrDirectory(pathLib.join(sourcePath, filename), pathLib.join(targetPath, filename));
    }
  } else {
    await fsCopyFile(sourcePath, targetPath);
  }
};
