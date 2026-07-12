import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { saveAs } from "file-saver";
import { Circle, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { createSpaceBackup, importSingleSpace } from "../../domain/import/backupRepository";
import { parseTobyExport } from "../../domain/import/toby";
import type { ValidationIssue } from "../../domain/import/validation";
import {
  getUserSetting,
  saveUserSetting,
  USER_SETTING_STORAGE_KEY
} from "../../domain/settings/repository";
import {
  createSpace,
  deleteSpace,
  getSpace,
  getSpaceList,
  reorderSpace,
  updateSpaceIcon
} from "../../domain/space/repository";
import type { SpaceSummary } from "../../domain/space/schema";
import { isXingLuoTabDragData } from "../../features/dnd/dragData";
import { useI18n } from "../../features/i18n/useI18n";
import {
  isKnownSpaceIcon,
  normalizeSpaceIconName,
  SPACE_ICON_NAMES,
  SpaceIcon,
  type SpaceIconName
} from "../../features/space/spaceIcons";
import { useSpaceVersion } from "../../features/storage/spaceVersionStore";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { SpaceSidebar } from "./SpaceSidebar";

type SpaceSidebarPageLayoutProps = {
  children: ReactNode;
};

type IconDialogState = {
  space: SpaceSummary;
  icon?: SpaceIconName;
} | null;

export function SpaceSidebarPageLayout({ children }: SpaceSidebarPageLayoutProps) {
  const { t } = useI18n();
  const { revision } = useSpaceVersion();
  const navigate = useNavigate();
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [createName, setCreateName] = useState<string | null>(null);
  const [iconDialog, setIconDialog] = useState<IconDialogState>(null);
  const [deleteTarget, setDeleteTarget] = useState<SpaceSummary | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const importSpaceInputRef = useRef<HTMLInputElement>(null);
  const importTobyInputRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const loadSidebarState = useCallback(async () => {
    const [nextSpaces, setting] = await Promise.all([getSpaceList(), getUserSetting()]);
    setSpaces(nextSpaces);
    setCollapsed(setting.isSidebarCollapsed);
  }, []);

  useEffect(() => {
    void loadSidebarState().catch(() => setStatus(t("common.operationFailed")));
  }, [loadSidebarState, revision, t]);

  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      const storedSetting = changes[USER_SETTING_STORAGE_KEY]?.newValue;
      if (areaName !== "local" || !storedSetting) return;
      try {
        const setting = JSON.parse(storedSetting as string) as { isSidebarCollapsed?: boolean };
        if (typeof setting.isSidebarCollapsed === "boolean") setCollapsed(setting.isSidebarCollapsed);
      } catch {
        setCollapsed(false);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  async function handleToggleCollapsed() {
    const nextCollapsed = !collapsed;
    setCollapsed(nextCollapsed);
    const setting = await getUserSetting();
    await saveUserSetting({ ...setting, isSidebarCollapsed: nextCollapsed });
  }

  async function handleCreateSpace(event: FormEvent) {
    event.preventDefault();
    const name = createName?.trim();
    if (!name) return;

    try {
      const summary = await createSpace(name);
      setCreateName(null);
      setSpaces((current) => [...current, summary]);
      navigate(`/space/${summary.id}`);
    } catch {
      setStatus(t("common.operationFailed"));
    }
  }

  async function handleImportSpace(file: File | undefined) {
    if (!file) return;
    try {
      const result = await importSingleSpace(JSON.parse(await file.text()) as unknown);
      if (!result.ok) {
        setStatus(formatIssues(result.issues, t("common.validationFailed")));
        return;
      }
      setSpaces((current) => [...current, result.value.summary]);
      navigate(`/space/${result.value.summary.id}`);
    } catch (error) {
      setStatus(error instanceof SyntaxError ? t("common.invalidJson") : t("common.operationFailed"));
    } finally {
      if (importSpaceInputRef.current) importSpaceInputRef.current.value = "";
    }
  }

  async function handleImportToby(file: File | undefined) {
    if (!file) return;
    try {
      const result = await importSingleSpace(createSpaceBackup(parseTobyExport(await file.text())));
      if (!result.ok) {
        setStatus(formatIssues(result.issues, t("common.validationFailed")));
        return;
      }
      setSpaces((current) => [...current, result.value.summary]);
      navigate(`/space/${result.value.summary.id}`);
    } catch {
      setStatus(t("common.operationFailed"));
    } finally {
      if (importTobyInputRef.current) importTobyInputRef.current.value = "";
    }
  }

  async function handleExportSpace(summary: SpaceSummary) {
    try {
      const space = await getSpace(summary.id);
      if (!space) {
        setStatus(t("space.notFound"));
        return;
      }
      saveAs(
        new Blob([JSON.stringify(createSpaceBackup(space), null, 2)], { type: "application/json;charset=utf-8" }),
        `${toSafeFileName(space.name)}_xingluotab-space.json`
      );
    } catch {
      setStatus(t("common.operationFailed"));
    }
  }

  async function handleSaveIcon(event: FormEvent) {
    event.preventDefault();
    if (!iconDialog) return;
    try {
      setSpaces(await updateSpaceIcon(iconDialog.space.id, iconDialog.icon));
      setIconDialog(null);
    } catch {
      setStatus(t("common.operationFailed"));
    }
  }

  async function handleDeleteSpace() {
    if (!deleteTarget) return;
    try {
      await deleteSpace(deleteTarget.id);
      setSpaces((current) => current.filter((space) => space.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      setStatus(t("common.operationFailed"));
    }
  }

  async function handleSpaceDragEnd(event: DragEndEvent) {
    const activeData = event.active.data.current;
    const overData = event.over?.data.current;
    if (!isXingLuoTabDragData(activeData) || !isXingLuoTabDragData(overData)) return;
    if (activeData.type !== "space" || overData.type !== "space" || activeData.spaceId === overData.spaceId) return;
    try {
      setSpaces(await reorderSpace(activeData.spaceId, overData.spaceId));
    } catch {
      setStatus(t("common.operationFailed"));
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void handleSpaceDragEnd(event)}>
      <div className="relative flex h-full min-w-0">
        <SpaceSidebar
          spaces={spaces}
          collapsed={collapsed}
          dndEnabled
          onToggleCollapsed={() => void handleToggleCollapsed()}
          onCreateSpace={() => setCreateName(t("sidebar.newSpace"))}
          onImportSpace={() => importSpaceInputRef.current?.click()}
          onImportToby={() => importTobyInputRef.current?.click()}
          onChangeSpaceIcon={(space) => setIconDialog({ space, icon: normalizeSpaceIconName(space.icon) })}
          onExportSpace={(space) => void handleExportSpace(space)}
          onDeleteSpace={setDeleteTarget}
        />
        <input
          ref={importSpaceInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => void handleImportSpace(event.currentTarget.files?.[0])}
        />
        <input
          ref={importTobyInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => void handleImportToby(event.currentTarget.files?.[0])}
        />
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {status ? (
            <div role="status" className="flex h-9 shrink-0 items-center justify-between border-b px-4 text-sm text-destructive">
              <span className="truncate">{status}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" title={t("common.close")} onClick={() => setStatus(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
          <div className="min-h-0 flex-1">{children}</div>
        </section>

        <Dialog open={createName != null} onOpenChange={(open) => !open && setCreateName(null)}>
          <DialogContent closeLabel={t("common.close")}>
            <DialogHeader>
              <DialogTitle>{t("space.create")}</DialogTitle>
              <DialogDescription>{t("space.enterName")}</DialogDescription>
            </DialogHeader>
            <form className="grid gap-4" onSubmit={(event) => void handleCreateSpace(event)}>
              <Input autoFocus value={createName ?? ""} onChange={(event) => setCreateName(event.currentTarget.value)} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateName(null)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit">{t("common.create")}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={iconDialog != null} onOpenChange={(open) => !open && setIconDialog(null)}>
          <DialogContent closeLabel={t("common.close")} className="w-[min(92vw,50rem)] max-w-[800px]">
            <DialogHeader>
              <DialogTitle>{t("space.changeIcon")}</DialogTitle>
              <DialogDescription>{t("space.chooseIcon")}</DialogDescription>
            </DialogHeader>
            <form className="grid gap-4" onSubmit={(event) => void handleSaveIcon(event)}>
              <div data-icon-grid="true" className="grid max-h-[400px] grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-4 overflow-y-auto p-4 sm:grid-cols-8">
                <IconButton
                  name="None"
                  selected={iconDialog?.icon == null}
                  title={t("space.noIcon")}
                  onClick={() => setIconDialog((current) => (current ? { ...current, icon: undefined } : current))}
                >
                  <Circle className="h-4 w-4" />
                </IconButton>
                {SPACE_ICON_NAMES.map((name) => (
                  <IconButton
                    key={name}
                    name={name}
                    selected={iconDialog?.icon === name}
                    title={name}
                    onClick={() =>
                      setIconDialog((current) => current && isKnownSpaceIcon(name) ? { ...current, icon: name } : current)
                    }
                  >
                    <SpaceIcon name={name} className="h-4 w-4" />
                  </IconButton>
                ))}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIconDialog(null)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit">{t("common.save")}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteTarget != null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("space.deleteSpace")}</AlertDialogTitle>
              <AlertDialogDescription>{t("space.deleteWarning")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleDeleteSpace()}>{t("common.delete")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DndContext>
  );
}

function IconButton({
  name,
  selected,
  title,
  onClick,
  children
}: {
  name: string;
  selected: boolean;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-icon-name={name}
      title={title}
      className={[
        "flex h-12 w-12 items-center justify-center justify-self-center rounded-lg border-2",
        selected ? "border-green-500 bg-green-50 text-green-600" : "border-transparent hover:bg-muted"
      ].join(" ")}
      onClick={onClick}
    >
      {children}
      <span className="sr-only">{title}</span>
    </button>
  );
}

function formatIssues(issues: ValidationIssue[], fallback: string) {
  if (issues.length === 0) return fallback;
  return `${fallback}: ${issues.slice(0, 3).map((issue) => `${issue.path}: ${issue.code}`).join("; ")}`;
}

function toSafeFileName(name: string) {
  return name.trim().replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_") || "space";
}
