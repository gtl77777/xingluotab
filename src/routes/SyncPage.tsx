import { Download, ExternalLink, Eye, EyeOff, LoaderCircle, Upload, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "../components/ui/alert-dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import { getSyncSetting, saveSyncSetting } from "../domain/sync/repository";
import type { SyncSetting } from "../domain/sync/schema";
import { useI18n } from "../features/i18n/useI18n";
import { useSpaceVersion } from "../features/storage/spaceVersionStore";
import { LocalBackupPanel } from "../features/sync/LocalBackupPanel";
import { runConfiguredSync, type RemoteSyncResult } from "../features/sync/remoteSync";

type ProviderMode = "github" | "webdav";
type Translate = ReturnType<typeof useI18n>["t"];

type PendingConflict = {
  mode: "push" | "pull" | "auto";
  providerMode: ProviderMode;
  result: RemoteSyncResult;
} | null;

type ActiveSync = {
  mode: "push" | "pull" | "auto";
  providerMode: ProviderMode;
} | null;

export function SyncPage() {
  const { t } = useI18n();
  const { version: spaceVersion } = useSpaceVersion();
  const navigate = useNavigate();
  const [setting, setSetting] = useState<SyncSetting | null>(null);
  const [status, setStatus] = useState<RemoteSyncResult | null>(null);
  const [activeSync, setActiveSync] = useState<ActiveSync>(null);
  const [pendingConflict, setPendingConflict] = useState<PendingConflict>(null);
  const [showGithubToken, setShowGithubToken] = useState(false);
  const [showWebDAVPassword, setShowWebDAVPassword] = useState(false);

  useEffect(() => {
    let mounted = true;
    void getSyncSetting()
      .then((nextSetting) => {
        if (!mounted) return;
        setSetting(nextSetting);
      })
      .catch(() => {
        if (!mounted) return;
        setStatus({
          status: "error",
          message: t("sync.loadError")
        });
      });
    return () => {
      mounted = false;
    };
  }, []);

  function updateSetting(resolve: (current: SyncSetting) => SyncSetting) {
    if (!setting) return;
    const nextSetting = resolve(setting);
    setStatus(null);
    setPendingConflict(null);
    setSetting(nextSetting);
    void saveSyncSetting(nextSetting).catch(() => {
      setStatus({
        status: "error",
        message: t("sync.saveError")
      });
    });
  }

  async function handleRemoteSync(providerMode: ProviderMode, mode: "push" | "pull" | "auto") {
    setStatus(null);
    setActiveSync({ mode, providerMode });
    try {
      const firstResult = await runConfiguredSync(mode, { providerMode, setting: setting ?? undefined });
      if (firstResult.status === "conflict") {
        setStatus(firstResult);
        setPendingConflict({ mode, providerMode, result: firstResult });
      } else {
        setStatus(firstResult);
      }
    } finally {
      setActiveSync(null);
    }
  }

  async function handleContinueConflict() {
    if (!pendingConflict) return;
    const { mode, providerMode } = pendingConflict;
    setPendingConflict(null);
    setActiveSync({ mode, providerMode });
    try {
      setStatus(await runConfiguredSync(mode, { force: true, providerMode, setting: setting ?? undefined }));
    } finally {
      setActiveSync(null);
    }
  }

  const disabled = !setting;

  return (
    <div className="h-full w-full overflow-y-auto p-4 pb-12">
      <h1 className="mb-2 text-xl font-semibold">{t("sync.title")}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{formatVersion(spaceVersion, t)}</p>

      <div className="space-y-6 content">
        <LocalBackupPanel onImported={(spaceId) => navigate(`/space/${spaceId}`)} />

        <div className="h-px w-full bg-border" />

        <section className="space-y-6">
          <h2 className="text-lg font-medium">{t("sync.remote")}</h2>
          <ProviderCard
            provider="github"
            title={t("sync.github")}
            betaLabel={t("common.beta")}
            checked={setting?.enableGithubGistSync ?? false}
            disabled={disabled}
            onCheckedChange={(checked) =>
              updateSetting((current) => ({
                ...current,
                enableGithubGistSync: checked,
                autoSyncMode: !checked && current.autoSyncMode === "github" ? "none" : current.autoSyncMode
              }))
            }
          >
            {setting?.enableGithubGistSync ? (
              <>
                <SyncInputRow label={t("sync.githubToken")}>
                  <PasswordInput
                    value={setting.githubToken}
                    visible={showGithubToken}
                    disabled={disabled}
                    placeholder={t("sync.githubTokenPlaceholder")}
                    autoComplete="off"
                    hideTitle={t("sync.hidePassword")}
                    showTitle={t("sync.showPassword")}
                    onVisibleChange={() => setShowGithubToken((current) => !current)}
                    onChange={(value) => updateSetting((current) => ({ ...current, githubToken: value }))}
                  />
                </SyncInputRow>
                <SyncActionRow
                  autoChecked={setting.autoSyncMode === "github"}
                  disabled={disabled || activeSync != null}
                  pushLoading={activeSync?.providerMode === "github" && activeSync.mode === "push"}
                  pullLoading={activeSync?.providerMode === "github" && activeSync.mode === "pull"}
                  modeLabel={t("sync.mode")}
                  localOverRemoteLabel={t("sync.localOverRemote")}
                  remoteOverLocalLabel={t("sync.remoteOverLocal")}
                  autoLabel={t("sync.auto")}
                  syncingLabel={t("sync.syncing")}
                  onAutoCheckedChange={(checked) =>
                    updateSetting((current) => ({
                      ...current,
                      autoSyncMode: checked ? "github" : current.autoSyncMode === "github" ? "none" : current.autoSyncMode
                    }))
                  }
                  onPush={() => void handleRemoteSync("github", "push")}
                  onPull={() => void handleRemoteSync("github", "pull")}
                />
              </>
            ) : null}
          </ProviderCard>

          <ProviderCard
            provider="webdav"
            title={t("sync.webdav")}
            betaLabel={t("common.beta")}
            checked={setting?.enableWebDAVSync ?? false}
            disabled={disabled}
            docsHref="https://help.jianguoyun.com/?p=2064"
            docsLabel={t("sync.webdavDocs")}
            onCheckedChange={(checked) =>
              updateSetting((current) => ({
                ...current,
                enableWebDAVSync: checked,
                autoSyncMode: !checked && current.autoSyncMode === "webdav" ? "none" : current.autoSyncMode
              }))
            }
          >
            {setting?.enableWebDAVSync ? (
              <>
                <SyncInputRow label={t("sync.webdavUrl")}>
                  <Input
                    value={setting.webDAVUrl}
                    disabled={disabled}
                    placeholder={t("sync.webdavUrlPlaceholder")}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateSetting((current) => ({ ...current, webDAVUrl: value }));
                    }}
                  />
                </SyncInputRow>
                <SyncInputRow label={t("sync.username")}>
                  <Input
                    value={setting.webDAVUsername}
                    disabled={disabled}
                    autoComplete="username"
                    placeholder={t("sync.usernamePlaceholder")}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateSetting((current) => ({ ...current, webDAVUsername: value }));
                    }}
                  />
                </SyncInputRow>
                <SyncInputRow label={t("sync.password")}>
                  <PasswordInput
                    value={setting.webDAVPassword}
                    visible={showWebDAVPassword}
                    disabled={disabled}
                    placeholder={t("sync.passwordPlaceholder")}
                    autoComplete="current-password"
                    hideTitle={t("sync.hidePassword")}
                    showTitle={t("sync.showPassword")}
                    onVisibleChange={() => setShowWebDAVPassword((current) => !current)}
                    onChange={(value) => updateSetting((current) => ({ ...current, webDAVPassword: value }))}
                  />
                </SyncInputRow>
                <SyncActionRow
                  autoChecked={setting.autoSyncMode === "webdav"}
                  disabled={disabled || activeSync != null}
                  pushLoading={activeSync?.providerMode === "webdav" && activeSync.mode === "push"}
                  pullLoading={activeSync?.providerMode === "webdav" && activeSync.mode === "pull"}
                  modeLabel={t("sync.mode")}
                  localOverRemoteLabel={t("sync.localOverRemote")}
                  remoteOverLocalLabel={t("sync.remoteOverLocal")}
                  autoLabel={t("sync.auto")}
                  syncingLabel={t("sync.syncing")}
                  onAutoCheckedChange={(checked) =>
                    updateSetting((current) => ({
                      ...current,
                      autoSyncMode: checked ? "webdav" : current.autoSyncMode === "webdav" ? "none" : current.autoSyncMode
                    }))
                  }
                  onPush={() => void handleRemoteSync("webdav", "push")}
                  onPull={() => void handleRemoteSync("webdav", "pull")}
                />
              </>
            ) : null}
          </ProviderCard>

          {status ? <RemoteStatus result={status} t={t} onDismiss={() => setStatus(null)} /> : null}
        </section>
      </div>

      <AlertDialog open={pendingConflict != null} onOpenChange={(open) => !open && setPendingConflict(null)}>
        <AlertDialogContent data-sync-message={pendingConflict?.result.message}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sync.conflictTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("sync.conflictDescription")}
              {formatConflictVersions(pendingConflict?.result, t)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction data-action="continue-sync-conflict" onClick={() => void handleContinueConflict()}>
              {t("common.continue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ProviderCard({
  provider,
  title,
  betaLabel,
  checked,
  disabled,
  docsHref,
  docsLabel,
  onCheckedChange,
  children
}: {
  provider: ProviderMode;
  title: string;
  betaLabel: string;
  checked: boolean;
  disabled: boolean;
  docsHref?: string;
  docsLabel?: string;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-lg border p-4" data-sync-provider={provider}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-medium">{title}</h3>
          <span className="rounded-md bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-100">
            {betaLabel}
          </span>
          {docsHref && docsLabel ? (
            <Button asChild variant="outline" className="h-7 px-2 text-xs">
              <a href={docsHref} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                {docsLabel}
              </a>
            </Button>
          ) : null}
        </div>
        <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
      </div>
      {children}
    </section>
  );
}

function SyncInputRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2 sm:flex sm:items-center sm:justify-between sm:gap-8 sm:space-y-0">
      <label className="block sm:flex-shrink-0">{label}</label>
      <div className="relative flex-1 sm:max-w-sm">{children}</div>
    </div>
  );
}

function PasswordInput({
  value,
  visible,
  disabled,
  placeholder,
  autoComplete,
  hideTitle,
  showTitle,
  onVisibleChange,
  onChange
}: {
  value: string;
  visible: boolean;
  disabled: boolean;
  placeholder: string;
  autoComplete: string;
  hideTitle: string;
  showTitle: string;
  onVisibleChange: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <>
      <Input
        type={visible ? "text" : "password"}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="pr-10"
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        onClick={onVisibleChange}
        disabled={disabled}
        title={visible ? hideTitle : showTitle}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </>
  );
}

function SyncActionRow({
  autoChecked,
  disabled,
  pushLoading,
  pullLoading,
  modeLabel,
  localOverRemoteLabel,
  remoteOverLocalLabel,
  autoLabel,
  syncingLabel,
  onAutoCheckedChange,
  onPush,
  onPull
}: {
  autoChecked: boolean;
  disabled: boolean;
  pushLoading: boolean;
  pullLoading: boolean;
  modeLabel: string;
  localOverRemoteLabel: string;
  remoteOverLocalLabel: string;
  autoLabel: string;
  syncingLabel: string;
  onAutoCheckedChange: (checked: boolean) => void;
  onPush: () => void;
  onPull: () => void;
}) {
  return (
    <>
      <div className="space-y-2 sm:flex sm:items-center sm:justify-between sm:gap-8 sm:space-y-0">
        <label className="sm:flex-shrink-0">{modeLabel}</label>
        <div className="flex justify-end gap-2">
          <Button className="min-w-40" variant="outline" disabled={disabled} aria-busy={pushLoading} onClick={onPush}>
            {pushLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {pushLoading ? syncingLabel : localOverRemoteLabel}
          </Button>
          <Button className="min-w-40" variant="outline" disabled={disabled} aria-busy={pullLoading} onClick={onPull}>
            {pullLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {pullLoading ? syncingLabel : remoteOverLocalLabel}
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-8 space-y-2 sm:space-y-2">
        <label>{autoLabel}</label>
        <Switch checked={autoChecked} disabled={disabled} onCheckedChange={onAutoCheckedChange} />
      </div>
    </>
  );
}

function RemoteStatus({ result, t, onDismiss }: { result: RemoteSyncResult; t: Translate; onDismiss: () => void }) {
  return (
    <div
      data-sync-status={result.status}
      data-sync-message={result.message}
      role="status"
      aria-live="polite"
      className={[
        "flex min-h-9 items-center justify-between gap-3 rounded-md border px-3 py-1 text-sm",
        result.status === "error" || result.status === "conflict" ? "text-destructive" : "",
        result.status === "pushed" || result.status === "pulled" || result.status === "noop" ? "text-primary" : ""
      ].join(" ")}
    >
      <span>{formatRemoteStatus(result, t)}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        title={t("common.close")}
        aria-label={t("common.close")}
        onClick={onDismiss}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function formatRemoteStatus(result: RemoteSyncResult, t: Translate) {
  if (result.status === "pushed") return t("sync.pushed");
  if (result.status === "pulled") return t("sync.pulled");
  if (result.status === "noop") return t("sync.noChanges");
  if (result.status === "conflict") return t("sync.conflictDescription");
  const reason =
    result.message === "sync.nogithubToken" || result.message === "sync.miss_webdav_credentials"
      ? t(result.message)
      : result.message;
  return reason ? `${t("sync.operationFailed")}: ${reason}` : t("sync.operationFailed");
}

function formatVersion(version: number, t: Translate) {
  if (!version) return t("sync.currentVersionZero");
  return t("sync.currentVersionDate", { version, date: new Date(version).toLocaleString() });
}

function formatConflictVersions(result: RemoteSyncResult | undefined, t: Translate) {
  if (result?.localVersion == null && result?.remoteVersion == null) return "";
  const localVersion = result.localVersion ?? t("sync.unknown");
  const remoteVersion = result.remoteVersion ?? t("sync.unknown");
  return ` ${t("sync.localVersion", { version: localVersion })} ${t("sync.remoteVersion", { version: remoteVersion })}`;
}
