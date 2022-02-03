import { Notifier } from 'coc-helper';
import { Window, workspace } from 'coc.nvim';
import colorConvert from 'color-convert';
import { toHex } from '.';
import { HighlightColor } from '../highlight/extractColors';

let _supportedSetbufline: boolean | undefined = undefined;
export async function supportedSetbufline() {
  if (_supportedSetbufline === undefined) {
    _supportedSetbufline = Boolean(
      await workspace.nvim.call('exists', ['*setbufline']),
    );
  }
  return _supportedSetbufline;
}

export function supportedFloat(): boolean {
  return workspace.floatSupported;
}
export function supportedNvimFloating() {
  return workspace.isNvim && supportedFloat();
}

export function supportedBufferHighlight() {
  return !workspace.env.isVim || workspace.env.textprop;
}

export async function enableWrapscan() {
  const wrapscan = await workspace.nvim.getOption('wrapscan');
  return !!wrapscan;
}

export async function registerRuntimepath(extensionPath: string) {
  const { nvim } = workspace;
  const rtp = (await nvim.getOption('runtimepath')) as string;
  const paths = rtp.split(',');
  if (!paths.includes(extensionPath)) {
    await nvim.command(
      `execute 'noa set rtp+='.fnameescape('${extensionPath.replace(
        /'/g,
        "''",
      )}')`,
    );
  }
}

export function generateHighlightFg(groupName: string, hl?: HighlightColor) {
  if (!hl) {
    return;
  }
  const guifg = hl.guifg;
  if (guifg) {
    const ctermfg =
      hl.ctermfg ??
      colorConvert.rgb.ansi256([guifg.red, guifg.green, guifg.blue]);

    return `highlight default ${groupName} ctermfg=${ctermfg} guifg=#${toHex(
      guifg,
    )}`;
  } else if (hl.ctermfg) {
    return `highlight default ${groupName} ctermfg=${hl.ctermfg}`;
  }
}

export async function displayWidth(str: string) {
  return (await workspace.nvim.call('strdisplaywidth', [str])) as number;
}

export async function displaySlice(str: string, start: number, end?: number) {
  return (await workspace.nvim.call('coc_explorer#util#strdisplayslice', [
    str,
    start,
    end ?? undefined,
  ])) as string;
}

export function closeWinByBufnrNotifier(bufnrs: number[]) {
  return Notifier.create(() => {
    workspace.nvim.call('coc_explorer#util#close_win_by_bufnr', bufnrs, true);
  });
}

export async function winnrByBufnr(bufnr: number | undefined) {
  if (!bufnr) {
    return undefined;
  }
  return workspace.nvim.call('bufwinnr', bufnr).then((winnr: number) => {
    if (winnr > 0) {
      return winnr;
    } else {
      return undefined;
    }
  });
}

export async function winidByWinnr(winnr: number | undefined) {
  if (!winnr) {
    return undefined;
  }
  const winid = (await workspace.nvim.call('win_getid', winnr)) as number;
  if (winid >= 0) {
    return winid;
  } else {
    return undefined;
  }
}

export async function winidByBufnr(bufnr: number | undefined) {
  if (!bufnr) {
    return undefined;
  }
  const winnr = await winnrByBufnr(bufnr);
  if (winnr) {
    return winidByWinnr(winnr);
  }

  const winid = (await workspace.nvim.call('bufwinid', [bufnr])) as number;
  if (winid === -1) {
    return undefined;
  }
}

export function winByWinid(winid: number): Promise<Window>;
export function winByWinid(winid: undefined): Promise<undefined>;
export function winByWinid(
  winid: number | undefined,
): Promise<Window | undefined>;
export async function winByWinid(winid: number | undefined) {
  if (winid) {
    return workspace.nvim.createWindow(winid);
  } else {
    return undefined;
  }
}

export async function bufnrByWinnrOrWinid(winnrOrWinid: number | undefined) {
  if (!winnrOrWinid) {
    return undefined;
  }
  const bufnr = (await workspace.nvim.call('winbufnr', winnrOrWinid)) as number;
  if (bufnr >= 0) {
    return bufnr;
  } else {
    return undefined;
  }
}

export async function winidsByBufnr(bufnr: number) {
  return (await workspace.nvim.call('win_findbuf', [bufnr])) as number[];
}

export async function winidsByBufnrInCurTab(bufnr: number) {
  const tabpage = await workspace.nvim.tabpage;
  const wins = await tabpage.windows;
  const winidsOfTab = wins.map((win) => win.id);
  const allWinids = (await workspace.nvim.call('win_findbuf', [
    bufnr,
  ])) as number[];
  return allWinids.filter((winid) => winidsOfTab.includes(winid));
}

export async function leaveEmptyInWinids(winids: number[]) {
  const curWinid = (await workspace.nvim.call('win_getid', [])) as number;
  if (!winids.length) {
    return;
  }
  workspace.nvim.pauseNotification();
  for (const winid of winids) {
    workspace.nvim.call('win_gotoid', [winid], true);
    workspace.nvim.command('enew', true);
    if (workspace.isVim) {
      workspace.nvim.command('redraw', true);
    }
  }
  workspace.nvim.call('win_gotoid', [curWinid], true);
  await workspace.nvim.resumeNotification();
}

export async function currentBufnr() {
  return workspace.nvim.call('bufnr') as Promise<number>;
}
