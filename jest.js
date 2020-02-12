const fs = require('fs');
const { spawn } = require('child_process');
const pathLib = require('path');

const fsp = fs.promises;

process.on('uncaughtException', function(err) {
  let msg = 'Uncaught exception: ' + err.stack;
  console.error(msg);
});

const execCli = (name, args, options) => {
  const streams = spawn(name, args, options);

  let output = '';
  streams.stdout.on('data', (data) => {
    output += data.toString();
  });
  return new Promise((resolve, reject) => {
    streams.stdout.on('error', (error) => {
      reject(error);
    });
    streams.stdout.on('end', () => {
      resolve(output);
    });
  });
};

module.exports = async () => {
  const testDir = './src/tests';
  const cocDir = pathLib.join(testDir, 'coc.nvim');
  if (!fs.existsSync(cocDir)) {
    await execCli('git', ['clone', '--depth', '1', 'git@github.com:neoclide/coc.nvim.git'], {
      cwd: testDir,
    });
    await execCli('yarn', ['install'], {
      cwd: cocDir,
    });
  }
  const dataDir = './node_modules/coc.nvim/data';
  const schemaPath = pathLib.join(dataDir, 'schema.json');
  if (!fs.existsSync(schemaPath)) {
    await fsp.mkdir(dataDir, { recursive: true });

    await fsp.copyFile(pathLib.join(cocDir, 'data/schema.json'), schemaPath);
  }

  process.env.NODE_ENV = 'test';
};
