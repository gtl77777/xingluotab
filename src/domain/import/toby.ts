import type { RecordTab, Space, TabGroup } from "../space/schema";
import type { IdFactory } from "./cloneSpace";
import { isSafeNavigationUrl } from "../../lib/safeUrl";

type TobyCard = {
  customTitle?: unknown;
  title?: unknown;
  url?: unknown;
};

type TobyList = {
  title?: unknown;
  cards?: unknown;
};

export type TobyIdFactory = Pick<IdFactory, "groupId" | "tabId"> & {
  spaceId(): string;
};

export function parseTobyExport(input: unknown, idFactory: TobyIdFactory = createTobyRuntimeIdFactory()): Space {
  const data = parseTobyInput(input);
  if (!Array.isArray(data.lists)) {
    throw new Error('Invalid Toby data structure: "lists" array not found.');
  }

  const groups: TabGroup[] = [];
  data.lists.forEach((list, listIndex) => {
    if (!isObject(list) || !Array.isArray(list.cards) || list.cards.length === 0) return;

    const tabs = list.cards.flatMap<RecordTab>((card) => {
      if (!isObject(card) || typeof card.url !== "string" || !isSafeNavigationUrl(card.url)) return [];
      return [
        {
          id: idFactory.tabId(),
          kind: "record",
          title: getCardTitle(card),
          url: card.url,
          favIconUrl: "",
          pinned: false
        }
      ];
    });

    if (tabs.length === 0) return;

    groups.push({
      id: idFactory.groupId(),
      name: typeof list.title === "string" && list.title.length > 0 ? list.title : `Imported Group ${listIndex + 1}`,
      tabs
    });
  });

  if (groups.length === 0) {
    throw new Error("No valid data found in Toby export to import.");
  }

  return {
    id: idFactory.spaceId(),
    name: "Imported from Toby",
    groups: groups.reverse(),
    pins: {}
  };
}

function parseTobyInput(input: unknown): { lists?: TobyList[] } {
  if (typeof input === "string") {
    try {
      return JSON.parse(input) as { lists?: TobyList[] };
    } catch {
      throw new Error("Invalid Toby JSON data format.");
    }
  }

  if (!isObject(input)) {
    throw new Error("Invalid Toby JSON data format.");
  }
  return input as { lists?: TobyList[] };
}

function getCardTitle(card: TobyCard) {
  if (typeof card.customTitle === "string" && card.customTitle.length > 0) return card.customTitle;
  if (typeof card.title === "string" && card.title.length > 0) return card.title;
  return "Untitled Tab";
}

function createTobyRuntimeIdFactory(): TobyIdFactory {
  const prefix = `toby_import_${Date.now()}`;
  return {
    spaceId: () => prefix,
    groupId: () => `group_${prefix}_${crypto.randomUUID()}`,
    tabId: () => `tab_${crypto.randomUUID()}`
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
