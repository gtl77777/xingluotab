import { FileDown, FileUp } from "lucide-react";
import { saveAs } from "file-saver";
import { useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import {
  BackupStorageError,
  exportBackup,
  importBackup
} from "../../domain/import/backupRepository";
import type { ValidationIssue, ValidationResult } from "../../domain/import/validation";
import type { Backup } from "../../domain/sync/schema";
import { useI18n } from "../i18n/useI18n";

type OperationState =
  | { tone: "muted"; message: string }
  | { tone: "success"; message: string }
  | { tone: "error"; message: string };

type LocalBackupPanelProps = {
  onImported?: (spaceId: string) => void;
};

export function LocalBackupPanel({ onImported }: LocalBackupPanelProps) {
  const { t } = useI18n();
  const [operation, setOperation] = useState<OperationState | null>(null);
  const fullBackupInputRef = useRef<HTMLInputElement>(null);

  async function handleExportBackup() {
    try {
      const backup = await exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
      saveAs(blob, "xingluotab_backup.json");
      setOperation({
        tone: "success",
        message: t("sync.exportedSpaces", { count: backup.spaceList.length })
      });
    } catch (error) {
      setOperation({
        tone: "error",
        message: formatError(error, t)
      });
    }
  }

  async function handleImportBackup(file: File | undefined) {
    if (!file) return;

    try {
      const result = await importBackup(await readJsonFile(file));
      setOperation(formatBackupImportResult(result, t));
      if (result.ok) {
        const firstSpace = result.value.spaceList[0];
        if (firstSpace) onImported?.(firstSpace.id);
      }
    } catch (error) {
      setOperation({
        tone: "error",
        message: formatError(error, t)
      });
    } finally {
      if (fullBackupInputRef.current) fullBackupInputRef.current.value = "";
    }
  }

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-medium">{t("sync.offline")}</h2>
      <div className="flex flex-wrap gap-4">
        <Button onClick={() => void handleExportBackup()}>
          <FileDown className="h-4 w-4" />
          {t("sync.exportData")}
        </Button>
        <Button variant="outline" onClick={() => fullBackupInputRef.current?.click()}>
          <FileUp className="h-4 w-4" />
          {t("sync.importData")}
        </Button>
        <input
          ref={fullBackupInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => void handleImportBackup(event.currentTarget.files?.[0])}
        />
      </div>
      {operation ? <StatusLine state={operation} /> : null}
    </section>
  );
}

async function readJsonFile(file: File) {
  return JSON.parse(await file.text()) as unknown;
}

function formatBackupImportResult(result: ValidationResult<Backup>, t: ReturnType<typeof useI18n>["t"]): OperationState {
  if (!result.ok) {
    return {
      tone: "error",
      message: formatIssues(result.issues, t)
    };
  }

  return {
    tone: "success",
    message: t("sync.importedSpaces", { count: result.value.spaceList.length })
  };
}

function formatError(error: unknown, t: ReturnType<typeof useI18n>["t"]) {
  if (error instanceof BackupStorageError) return formatIssues(error.issues, t);
  if (error instanceof SyntaxError) return t("common.invalidJson");
  return t("common.operationFailed");
}

function formatIssues(issues: ValidationIssue[], t: ReturnType<typeof useI18n>["t"]) {
  if (issues.length === 0) return t("common.validationFailed");

  return issues
    .slice(0, 3)
    .map((issue) => `${issue.path}: ${issue.code}`)
    .join("; ");
}

function StatusLine({ state }: { state: OperationState }) {
  return (
    <div
      className={[
        "text-sm",
        state.tone === "error" ? "text-destructive" : "",
        state.tone === "success" ? "text-primary" : "",
        state.tone === "muted" ? "text-muted-foreground" : ""
      ].join(" ")}
    >
      {state.message}
    </div>
  );
}
