import path from 'path';
import { config } from '../config';
import { execCmdLine, executable, shellescape } from './cli';

const nodejsModuleTrash = async (paths: string[]) => {
  const nodePath = process.argv[0];
  const scriptPath = path.join(__dirname, '../cli/trash.mjs');
  const pathArgs = paths.map((p) => shellescape(p)).join(' ');
  const cmd = `${shellescape(nodePath)} ${shellescape(scriptPath)} ${pathArgs}`;
  await execCmdLine(cmd);
};

class TrashTemplateCmd {
  private inited = false;
  private placeholders = {
    list: '%l',
    sourceFile: '%s',
  };
  private exec_: (paths: string[]) => Promise<void> = async () => {};

  async init() {
    if (this.inited) {
      return;
    }

    const configTrashCommand = config.get<string>('trash.command')!;

    if (configTrashCommand === 'nodejs:module') {
      this.exec_ = async (paths) => {
        await nodejsModuleTrash(paths);
      };
      return;
    }

    const m = configTrashCommand.match(/^([^\s]+)/);
    const cmd = m?.[1];
    if (!cmd) {
      this.exec_ = async () => {
        throw new Error("'explorer.trash.command' must not be empty");
      };
      return;
    }

    const checkCmd = async (cmd: string) => {
      if (!(await executable(cmd))) {
        throw new Error(`command(${cmd}) does not exist`);
      }
    };

    if (configTrashCommand.includes(this.placeholders.list)) {
      this.exec_ = async (paths) => {
        await checkCmd(cmd);
        const pathArgs = paths.map((p) => shellescape(p)).join(' ');
        await execCmdLine(
          configTrashCommand.replace(
            new RegExp(this.placeholders.list, 'g'),
            pathArgs,
          ),
        );
      };
    } else if (configTrashCommand.includes(this.placeholders.sourceFile)) {
      this.exec_ = async (paths) => {
        await checkCmd(cmd);
        for (const path of paths.map((p) => shellescape(p))) {
          await execCmdLine(
            configTrashCommand.replace(
              new RegExp(this.placeholders.sourceFile, 'g'),
              path,
            ),
          );
        }
      };
    }

    this.inited = true;
  }

  async exec(paths: string[]) {
    await this.init();
    await this.exec_(paths);
  }
}

export const trashCmd = new TrashTemplateCmd();
