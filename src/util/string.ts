export function byteIndex(content: string, index: number): number {
  const s = content.slice(0, index);
  return Buffer.byteLength(s);
}

export function byteLength(str: string): number {
  return Buffer.byteLength(str);
}

export function truncate(name: string, width: number, padSide: 'start' | 'end') {
  if (name.length > width) {
    const truncWidth = name.length - width + 2;
    const truncRight = Math.floor(truncWidth / 2);
    const truncLeft = truncWidth % 2 ? truncRight + 1 : truncRight;
    const leftName = name.slice(0, Math.floor(name.length / 2) - truncLeft);
    const rightName = name.slice(Math.floor(name.length / 2) + truncRight);
    return leftName + '..' + rightName;
  } else {
    if (padSide === 'start') {
      return name.padStart(width, ' ');
    } else {
      return name.padEnd(width, ' ');
    }
  }
}

