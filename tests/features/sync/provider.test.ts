import { describe, expect, it } from "vitest";
import { validateBackup } from "../../../src/domain/import/validation";
import type { Backup } from "../../../src/domain/sync/schema";
import { BACKUP_NAME, decideSyncDirection, parseRemoteBackup, serializeBackup } from "../../../src/features/sync/provider";

const backup: Backup = {
  schemaVersion: 1,
  type: "xingluotab-backup",
  dataVersion: 10,
  spaceList: [{ id: "space-a", name: "Main" }],
  spaces: {
    "space-a": {
      id: "space-a",
      name: "Main",
      pins: {},
      groups: [
        {
          id: "group-a",
          name: "A",
          tabs: [{ id: "tab-a", kind: "record", title: "A", url: "https://a.example/" }]
        }
      ]
    }
  }
};

describe("sync provider helpers", () => {
  it("uses an isolated V2 remote backup name", () => {
    expect(BACKUP_NAME).toBe("xingluotab_backup");
  });

  it("decides sync direction by backup version", () => {
    expect(decideSyncDirection(backup, null)).toBe("push-local");
    expect(decideSyncDirection(backup, { ...backup, dataVersion: 11 })).toBe("pull-remote");
    expect(decideSyncDirection(backup, { ...backup, dataVersion: 9 })).toBe("push-local");
    expect(decideSyncDirection(backup, { ...backup, dataVersion: 10 })).toBe("noop");
  });

  it("serializes and validates remote backup content", () => {
    expect(validateBackup(backup).ok).toBe(true);
    expect(parseRemoteBackup(serializeBackup(backup))).toEqual({ ok: true, value: backup });
    expect(parseRemoteBackup(null)).toEqual({ ok: true, value: null });
    expect(parseRemoteBackup("{")).toMatchObject({ ok: false });
    expect(parseRemoteBackup(JSON.stringify({ ...backup, spaceList: [] }))).toMatchObject({ ok: false });
  });
});
