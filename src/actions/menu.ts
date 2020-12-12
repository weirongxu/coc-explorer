export namespace ActionMenu {
  export type OptionMenus = Record<
    string,
    | string
    | {
        description: string;
        args?: string;
        actionArgs?: () => string[] | Promise<string[]>;
      }
  >;

  export function getNormalizeMenus(menus: OptionMenus) {
    return Object.entries(menus).map(([key, value]) => {
      const actionArgs = async () => {
        return key.split(/:/);
      };
      return typeof value === 'string'
        ? {
            description: value,
            args: key,
            actionArgs,
          }
        : Object.assign(
            {
              args: key,
              actionArgs,
            },
            value,
          );
    });
  }
}
