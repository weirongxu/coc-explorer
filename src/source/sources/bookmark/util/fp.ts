// encode/decode filepath

export function encode(filepath: string): string {
  return encodeURIComponent(filepath).replace(/\./g, '%2E');
}

export function decode(text: string): string {
  // dont need to replace "%2E" by "."
  return decodeURIComponent(text);
}
