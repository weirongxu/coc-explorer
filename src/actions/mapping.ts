export type Action = {
  name: string;
  args: string[];
};

export type ActionExp = Action | ActionExp[];

export type OriginalAction = string | Action;

export type OriginalActionExp = OriginalAction | OriginalActionExp[];

export type OriginalMappings = Record<string, false | OriginalActionExp>;
