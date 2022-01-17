export function byteIndex(content: string, index: number): number {
  const s = content.slice(0, index);
  return Buffer.byteLength(s);
}

export function byteLength(str: string): number {
  return Buffer.byteLength(str);
}

export function charIndex(content: string, byteIndex: number): number {
  const buf = Buffer.from(content, 'utf8');
  return buf.slice(0, byteIndex).toString('utf8').length;
}

export function splitCount(str: string, sep: string, count = 2): string[] {
  const ret: string[] = [];
  let remain = str;
  let idx = str.indexOf(sep);
  while (idx !== -1 && count > 1) {
    ret.push(remain.slice(0, idx));
    remain = remain.slice(idx + 1);
    idx = remain.indexOf(sep);
    count -= 1;
  }
  ret.push(remain);
  return ret;
}

export function isASCII(str: string) {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\xFF]*$/.test(str);
}
