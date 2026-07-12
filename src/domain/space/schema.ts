export type SpaceSummary = {
  id: string;
  name: string;
  icon?: string;
};

export type RecordTab = {
  id: string;
  kind: "record";
  title: string;
  url: string;
  favIconUrl?: string;
  pinned?: boolean;
};

export type SessionTab = Omit<RecordTab, "kind"> & {
  kind: "session";
  tid: string;
  pinned: boolean;
};

export type TabGroup = {
  id: string;
  name: string;
  createdAt?: number;
  tabs: RecordTab[];
  tags?: string[];
};

export type Space = {
  id: string;
  name: string;
  groups: TabGroup[];
  pins: Record<string, number>;
};

export function createEmptySpace(id: string, name: string): Space {
  return {
    id,
    name,
    groups: [],
    pins: {}
  };
}
