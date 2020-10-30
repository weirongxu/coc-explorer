export type Action = {
  name: string;
  args: string[];
};

export type ActionExp = Action | ActionExp[];

export type OriginalAction = string | Action;

export type OriginalActionExp = OriginalAction | OriginalActionExp[];

export type OriginalMappings = Record<string, OriginalActionExp>;

export type OriginalUserMappings = Record<string, false | OriginalActionExp>;

export type Mappings = Record<string, ActionExp>;

export type MappingMode = 'n' | 'v';
