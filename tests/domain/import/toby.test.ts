import { describe, expect, it } from "vitest";
import { parseTobyExport } from "../../../src/domain/import/toby";

const idFactory = {
  spaceId: () => "toby-space",
  groupId: (() => {
    const ids = ["group-a", "group-b"];
    return () => ids.shift() ?? "group-extra";
  })(),
  tabId: (() => {
    const ids = ["tab-a", "tab-b", "tab-c"];
    return () => ids.shift() ?? "tab-extra";
  })()
};

describe("Toby import parser", () => {
  it("converts Toby lists into a single imported space", () => {
    const space = parseTobyExport(
      {
        lists: [
          {
            title: "First",
            cards: [
              { title: "Example", customTitle: "Custom Example", url: "https://example.com/" },
              { title: "Missing URL" }
            ]
          },
          {
            title: "Second",
            cards: [{ title: "Second Tab", url: "https://example.org/" }]
          }
        ]
      },
      idFactory
    );

    expect(space).toEqual({
      id: "toby-space",
      name: "Imported from Toby",
      pins: {},
      groups: [
        {
          id: "group-b",
          name: "Second",
          tabs: [
            {
              id: "tab-b",
              kind: "record",
              title: "Second Tab",
              url: "https://example.org/",
              favIconUrl: "",
              pinned: false
            }
          ]
        },
        {
          id: "group-a",
          name: "First",
          tabs: [
            {
              id: "tab-a",
              kind: "record",
              title: "Custom Example",
              url: "https://example.com/",
              favIconUrl: "",
              pinned: false
            }
          ]
        }
      ]
    });
  });

  it("rejects invalid Toby data", () => {
    expect(() => parseTobyExport("{bad json")).toThrow("Invalid Toby JSON data format.");
    expect(() => parseTobyExport({ lists: [] })).toThrow("No valid data found in Toby export to import.");
    expect(() => parseTobyExport({})).toThrow('Invalid Toby data structure: "lists" array not found.');
  });

  it("drops Toby cards with unsafe navigation schemes", () => {
    expect(() => parseTobyExport({ lists: [{ title: "Unsafe", cards: [{ title: "Script", url: "javascript:alert(1)" }] }] }))
      .toThrow("No valid data found in Toby export to import.");
  });
});
