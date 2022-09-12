import trash from 'trash';

export const main = async () => {
  const paths = process.argv.slice(2);
  await trash(paths, { glob: false });
};

await main();
