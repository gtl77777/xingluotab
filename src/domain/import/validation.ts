import type { Space } from "../space/schema";
import {
  CURRENT_BACKUP_SCHEMA_VERSION,
  type Backup,
  type SpaceBackup
} from "../sync/schema";
import { isSafeNavigationUrl } from "../../lib/safeUrl";

export type ValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export type ValidationResult<T> =
  | { ok: true; value: T; issues: [] }
  | { ok: false; issues: ValidationIssue[] };

function issue(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasString(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "string" && (value[key] as string).length > 0;
}

export function validateBackup(input: unknown): ValidationResult<Backup> {
  const issues: ValidationIssue[] = [];
  const seenSpaceIds = new Set<string>();
  const seenGroupIds = new Set<string>();
  const seenTabIds = new Set<string>();

  if (!isObject(input)) {
    return { ok: false, issues: [issue("$", "backup.type", "Backup must be an object")] };
  }

  if (input.schemaVersion !== CURRENT_BACKUP_SCHEMA_VERSION) {
    issues.push(
      issue(
        "$.schemaVersion",
        "backup.schemaVersion",
        `schemaVersion must be ${CURRENT_BACKUP_SCHEMA_VERSION}`
      )
    );
  }
  if (input.type !== "xingluotab-backup") {
    issues.push(issue("$.type", "backup.type", "type must be xingluotab-backup"));
  }
  if (!isNonNegativeInteger(input.dataVersion)) {
    issues.push(issue("$.dataVersion", "backup.dataVersion", "dataVersion must be a non-negative integer"));
  }
  if (!Array.isArray(input.spaceList) || input.spaceList.length === 0) {
    issues.push(issue("$.spaceList", "backup.spaceList", "spaceList must be a non-empty array"));
  }
  if (!isObject(input.spaces)) {
    issues.push(issue("$.spaces", "backup.spaces", "spaces must be an object"));
  }

  if (issues.length > 0) return { ok: false, issues };

  const spaceList = input.spaceList as unknown[];
  const spaces = input.spaces as Record<string, unknown>;

  for (let index = 0; index < spaceList.length; index += 1) {
    const summaryPath = `$.spaceList[${index}]`;
    const summary = spaceList[index];

    if (!isObject(summary)) {
      issues.push(issue(summaryPath, "spaceSummary.type", "space summary must be an object"));
      continue;
    }
    if (!hasString(summary, "id")) {
      issues.push(issue(`${summaryPath}.id`, "spaceSummary.id", "space summary id is required"));
      continue;
    }
    if (!hasString(summary, "name")) {
      issues.push(issue(`${summaryPath}.name`, "spaceSummary.name", "space summary name is required"));
    }

    const spaceId = summary.id as string;
    if (seenSpaceIds.has(spaceId)) {
      issues.push(issue(`${summaryPath}.id`, "spaceSummary.duplicateId", `duplicate space id: ${spaceId}`));
    }
    seenSpaceIds.add(spaceId);

    const space = spaces[spaceId];
    if (!isObject(space)) {
      issues.push(issue(`$.spaces.${spaceId}`, "space.missing", `space ${spaceId} is missing`));
      continue;
    }

    validateSpace(space, `$.spaces.${spaceId}`, issues, seenGroupIds, seenTabIds);
    if ((space.id as string | undefined) !== spaceId) {
      issues.push(issue(`$.spaces.${spaceId}.id`, "space.idMismatch", "space id must match spaces key"));
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  const normalizedSpaces = Object.fromEntries(
    spaceList.flatMap((summary) => {
      if (!isObject(summary) || !hasString(summary, "id")) return [];
      const spaceId = summary.id as string;
      const space = spaces[spaceId];
      if (!isObject(space)) return [];
      return [[spaceId, { ...space, pins: isObject(space.pins) ? space.pins : {} }]];
    })
  ) as Backup["spaces"];

  return {
    ok: true,
    value: {
      schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
      type: "xingluotab-backup",
      dataVersion: input.dataVersion as number,
      spaceList: input.spaceList as Backup["spaceList"],
      spaces: normalizedSpaces
    },
    issues: []
  };
}

export function validateSingleSpace(input: unknown): ValidationResult<Space> {
  if (!isObject(input)) {
    return { ok: false, issues: [issue("$", "spaceBackup.type", "Space backup must be an object")] };
  }
  const issues: ValidationIssue[] = [];
  if (input.schemaVersion !== CURRENT_BACKUP_SCHEMA_VERSION) {
    issues.push(
      issue(
        "$.schemaVersion",
        "spaceBackup.schemaVersion",
        `schemaVersion must be ${CURRENT_BACKUP_SCHEMA_VERSION}`
      )
    );
  }
  if (input.type !== "xingluotab-space") {
    issues.push(issue("$.type", "spaceBackup.type", "type must be xingluotab-space"));
  }
  if (!isObject(input.space)) {
    issues.push(issue("$.space", "spaceBackup.space", "space must be an object"));
  }
  if (issues.length > 0) return { ok: false, issues };
  return validateSpaceImport((input as unknown as SpaceBackup).space);
}

function validateSpaceImport(input: unknown): ValidationResult<Space> {
  const issues: ValidationIssue[] = [];
  validateSpace(input, "$.space", issues, new Set<string>(), new Set<string>());
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: input as Space, issues: [] };
}

function validateSpace(
  input: unknown,
  path: string,
  issues: ValidationIssue[],
  seenGroupIds: Set<string>,
  seenTabIds: Set<string>
) {
  if (!isObject(input)) {
    issues.push(issue(path, "space.type", "space must be an object"));
    return;
  }
  if (!hasString(input, "id")) issues.push(issue(`${path}.id`, "space.id", "space id is required"));
  if (!hasString(input, "name")) issues.push(issue(`${path}.name`, "space.name", "space name is required"));
  if (!Array.isArray(input.groups)) {
    issues.push(issue(`${path}.groups`, "space.groups", "groups must be an array"));
    return;
  }
  if (!isObject(input.pins)) {
    issues.push(issue(`${path}.pins`, "space.pins", "pins must be an object"));
  }

  const groupIds = new Set<string>();
  input.groups.forEach((group, groupIndex) => {
    if (isObject(group) && hasString(group, "id")) groupIds.add(group.id as string);
    validateGroup(group, `${path}.groups[${groupIndex}]`, issues, seenGroupIds, seenTabIds);
  });

  if (isObject(input.pins)) {
    for (const [groupId, timestamp] of Object.entries(input.pins)) {
      if (!groupIds.has(groupId)) {
        issues.push(issue(`${path}.pins.${groupId}`, "space.pin.unknownGroup", `pin references unknown group: ${groupId}`));
      }
      if (!isNonNegativeInteger(timestamp)) {
        issues.push(issue(`${path}.pins.${groupId}`, "space.pin.value", "pin value must be a non-negative integer"));
      }
    }
  }
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validateGroup(
  input: unknown,
  path: string,
  issues: ValidationIssue[],
  seenGroupIds: Set<string>,
  seenTabIds: Set<string>
) {
  if (!isObject(input)) {
    issues.push(issue(path, "group.type", "group must be an object"));
    return;
  }
  if (!hasString(input, "id")) {
    issues.push(issue(`${path}.id`, "group.id", "group id is required"));
  } else if (seenGroupIds.has(input.id as string)) {
    issues.push(issue(`${path}.id`, "group.duplicateId", `duplicate group id: ${input.id}`));
  } else {
    seenGroupIds.add(input.id as string);
  }
  if (!hasString(input, "name")) issues.push(issue(`${path}.name`, "group.name", "group name is required"));
  if (!Array.isArray(input.tabs)) {
    issues.push(issue(`${path}.tabs`, "group.tabs", "tabs must be an array"));
    return;
  }
  if (input.tags !== undefined && (!Array.isArray(input.tags) || input.tags.some((tag) => typeof tag !== "string"))) {
    issues.push(issue(`${path}.tags`, "group.tags", "group tags must be an array of strings"));
  }
  if (input.createdAt !== undefined && !isNonNegativeInteger(input.createdAt)) {
    issues.push(issue(`${path}.createdAt`, "group.createdAt", "group createdAt must be a non-negative integer"));
  }

  input.tabs.forEach((tab, tabIndex) => {
    validateTab(tab, `${path}.tabs[${tabIndex}]`, issues, seenTabIds);
  });
}

function validateTab(input: unknown, path: string, issues: ValidationIssue[], seenTabIds: Set<string>) {
  if (!isObject(input)) {
    issues.push(issue(path, "tab.type", "tab must be an object"));
    return;
  }
  if (!hasString(input, "id")) {
    issues.push(issue(`${path}.id`, "tab.id", "tab id is required"));
  } else if (seenTabIds.has(input.id as string)) {
    issues.push(issue(`${path}.id`, "tab.duplicateId", `duplicate tab id: ${input.id}`));
  } else {
    seenTabIds.add(input.id as string);
  }
  if (input.kind !== "record") issues.push(issue(`${path}.kind`, "tab.kind", "tab kind must be record"));
  if (typeof input.title !== "string") issues.push(issue(`${path}.title`, "tab.title", "tab title is required"));
  if (!hasString(input, "url")) {
    issues.push(issue(`${path}.url`, "tab.url", "tab url is required"));
  } else if (!isSafeNavigationUrl(input.url as string)) {
    issues.push(issue(`${path}.url`, "tab.url.unsafe", "tab url uses an unsafe navigation scheme"));
  } else {
    try {
      new URL(input.url as string);
    } catch {
      issues.push(issue(`${path}.url`, "tab.url.invalid", "tab url must be a valid URL"));
    }
  }
}
