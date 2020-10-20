export enum GitFormat {
  mixed = '*',
  unmodified = ' ',
  modified = 'M',
  added = 'A',
  deleted = 'D',
  renamed = 'R',
  copied = 'C',
  unmerged = 'U',
  untracked = '?',
  ignored = '!',
}

export type GitFormatForY = Exclude<GitFormat, GitFormat.ignored>;

export type GitStatus = {
  fullpath: string;
  x: GitFormat;
  y: GitFormatForY;

  added: boolean;
  modified: boolean;
  deleted: boolean;
  renamed: boolean;
  copied: boolean;

  staged: boolean;
  unmerged: boolean;
  untracked: boolean;
  ignored: boolean;
};

export type GitMixedStatus = {
  x: GitFormat;
  y: GitFormatForY;
};

export enum GitRootFormat {
  staged,
  ahead,
  behind,
  conflicted,
  untracked,
  stashed,
  modified,
  added,
  renamed,
  deleted,
}

export type GitRootStatus = {
  allStaged: boolean;
  formats: GitRootFormat[];
};
