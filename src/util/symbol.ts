export function getSymbol<T>(obj: object, sym: symbol, getDefault: () => T): T {
  if (!Reflect.has(obj, sym)) {
    Reflect.set(obj, sym, getDefault());
  }
  return Reflect.get(obj, sym);
}
