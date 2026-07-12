import { Check, ExternalLink, ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { BrandMark } from "../components/brand/BrandMark";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../components/ui/select";
import { getUserSetting, saveUserSetting } from "../domain/settings/repository";
import type { UserSetting } from "../domain/settings/schema";
import { languageOptions } from "../features/i18n/messages";
import { useI18n } from "../features/i18n/useI18n";
import {
  ACCENT_THEMES,
  DARK_VISUAL_THEMES,
  LIGHT_VISUAL_THEMES,
  applyAccentTheme,
  applyVisualTheme,
  createLogoDataUrl,
  type AccentTheme,
  type DarkVisualTheme,
  type LightVisualTheme,
  type VisualTheme
} from "../features/settings/appearance";
import { applyDocumentTheme } from "../features/settings/theme";
import { openUrl } from "../platform/browser";

type SaveState = {
  tone: "error";
  message: string;
};

type SettingOption = {
  value: string;
  label: string;
};

export function SettingsPage() {
  const [userSetting, setUserSetting] = useState<UserSetting | null>(null);
  const { t } = useI18n(userSetting?.language);
  const [saveState, setSaveState] = useState<SaveState | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;

    void getUserSetting()
      .then((setting) => {
        if (!mounted) return;
        setUserSetting(setting);
        setSaveState(null);
      })
      .catch(() => {
        if (!mounted) return;
        setSaveState({
          tone: "error",
          message: t("settings.loadError")
        });
      });

    return () => {
      mounted = false;
    };
  }, []);

  function commitUserSetting(nextSetting: UserSetting) {
    setUserSetting(nextSetting);
    setSaveState(null);

    void saveUserSetting(nextSetting)
      .then(() => {
        const resolvedMode = applyDocumentTheme(nextSetting.theme);
        applyAccentTheme(nextSetting.accentTheme);
        applyVisualTheme(resolvedMode, nextSetting.lightVisualTheme, nextSetting.darkVisualTheme);
      })
      .catch(() => {
        setSaveState({
          tone: "error",
          message: t("settings.saveError")
        });
      });
  }

  function updateUserSetting(patch: Partial<UserSetting>) {
    if (!userSetting) return;
    commitUserSetting({ ...userSetting, ...patch });
  }

  const disabled = !userSetting;

  return (
    <div className="h-full overflow-y-auto p-4 pb-6">
      <div className="mb-4 flex items-center">
        <h1 className="text-xl font-semibold">{t("settings.title")}</h1>
        <Button asChild variant="outline" className="ml-4 h-8">
          <a href="https://github.com/gtl77777/xingluotab#readme" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
            {t("settings.docs")}
          </a>
        </Button>
      </div>

      <div className="space-y-3">
        <SettingSelect
          settingKey="language"
          label={t("settings.language")}
          value={userSetting?.language ?? "en"}
          disabled={disabled}
          onChange={(value) => updateUserSetting({ language: value })}
          options={languageOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
        />
        <SettingSelect
          settingKey="theme"
          label={t("settings.colorMode")}
          value={userSetting?.theme ?? "light"}
          disabled={disabled}
          onChange={(value) => updateUserSetting({ theme: value as UserSetting["theme"] })}
          options={[
            { value: "light", label: t("settings.theme.light") },
            { value: "dark", label: t("settings.theme.dark") },
            { value: "system", label: t("settings.theme.system") }
          ]}
        />
        <LogoSetting
          value={userSetting?.logoDataUrl}
          disabled={disabled}
          inputRef={logoInputRef}
          onChange={(logoDataUrl) => updateUserSetting({ logoDataUrl })}
          onError={(issue) => setSaveState({ tone: "error", message: t(issue) })}
          t={t}
        />
        <VisualThemeSetting
          settingKey="lightVisualTheme"
          label={t("settings.visualStyle.light")}
          value={userSetting?.lightVisualTheme ?? "professional"}
          options={LIGHT_VISUAL_THEMES}
          disabled={disabled}
          onChange={(lightVisualTheme) => updateUserSetting({ lightVisualTheme: lightVisualTheme as LightVisualTheme })}
          t={t}
        />
        <VisualThemeSetting
          settingKey="darkVisualTheme"
          label={t("settings.visualStyle.dark")}
          value={userSetting?.darkVisualTheme ?? "professional"}
          options={DARK_VISUAL_THEMES}
          disabled={disabled}
          onChange={(darkVisualTheme) => updateUserSetting({ darkVisualTheme: darkVisualTheme as DarkVisualTheme })}
          t={t}
        />
        <AccentThemeSetting
          value={userSetting?.accentTheme ?? "pink"}
          disabled={disabled}
          onChange={(accentTheme) => updateUserSetting({ accentTheme })}
          t={t}
        />
        <SettingSelect
          settingKey="zenTheme"
          label={t("settings.zenTheme")}
          value={userSetting?.zenTheme ?? "minimal"}
          disabled={disabled}
          onChange={(value) => updateUserSetting({ zenTheme: value as UserSetting["zenTheme"] })}
          options={[
            { value: "minimal", label: t("settings.zenTheme.minimal") },
            { value: "ghibli", label: t("settings.zenTheme.ghibli") },
            { value: "glass", label: t("settings.zenTheme.glass") }
          ]}
        />
        <SettingSelect
          settingKey="openTabMode"
          label={t("settings.openTabMode")}
          value={userSetting?.openTabMode ?? "newtab"}
          disabled={disabled}
          onChange={(value) => updateUserSetting({ openTabMode: value as UserSetting["openTabMode"] })}
          options={[
            { value: "newtab", label: t("settings.openTabMode.newtab") },
            { value: "replace", label: t("settings.openTabMode.replace") }
          ]}
        />
        <SettingSelect
          settingKey="openGroupMode"
          label={t("settings.openGroupMode")}
          value={userSetting?.openGroupMode ?? "nogroup"}
          disabled={disabled}
          onChange={(value) => updateUserSetting({ openGroupMode: value as UserSetting["openGroupMode"] })}
          options={[
            { value: "nogroup", label: t("settings.openGroupMode.nogroup") },
            { value: "group", label: t("settings.openGroupMode.group") }
          ]}
        />
        <SettingSelect
          settingKey="showPinnedSessionTab"
          label={t("settings.showPinnedSessionTab")}
          value={userSetting?.showPinnedSessionTab ?? "always"}
          disabled={disabled}
          onChange={(value) => updateUserSetting({ showPinnedSessionTab: value as UserSetting["showPinnedSessionTab"] })}
          options={[
            { value: "ignore", label: t("settings.showPinnedSessionTab.ignore") },
            { value: "always", label: t("settings.showPinnedSessionTab.always") }
          ]}
        />
        <SettingSelect
          settingKey="removeWhenClickWithAlt"
          label={t("settings.removeWhenClickWithAlt")}
          value={userSetting?.removeWhenClickWithAlt ?? "yes"}
          disabled={disabled}
          onChange={(value) => updateUserSetting({ removeWhenClickWithAlt: value as UserSetting["removeWhenClickWithAlt"] })}
          options={[
            { value: "yes", label: t("settings.yes") },
            { value: "no", label: t("settings.no") }
          ]}
        />
        <SettingSelect
          settingKey="newtab"
          label={t("settings.newtab")}
          value={userSetting?.newtab ?? "override"}
          disabled={disabled}
          onChange={(value) => updateUserSetting({ newtab: value as UserSetting["newtab"] })}
          options={[
            { value: "override", label: t("settings.newtab.override") },
            { value: "none", label: t("settings.newtab.none") }
          ]}
        />
        <div className="flex items-center gap-12" data-setting-key="shortcuts">
          <label className="w-64 text-base">{t("settings.shortcuts")}</label>
          <Button
            type="button"
            variant="outline"
            className="w-40"
            disabled={disabled}
            onClick={() => void openUrl("chrome://extensions/shortcuts", { active: true })}
          >
            {t("settings.browserShortcuts")}
          </Button>
        </div>
      </div>

      {saveState ? <StatusLine state={saveState} /> : null}
    </div>
  );
}

function LogoSetting({
  value,
  disabled,
  inputRef,
  onChange,
  onError,
  t
}: {
  value?: string;
  disabled: boolean;
  inputRef: { current: HTMLInputElement | null };
  onChange: (value: string | undefined) => void;
  onError: (key: "settings.logo.invalidType" | "settings.logo.tooLarge" | "settings.logo.failed") => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  async function handleFile(file: File | undefined) {
    if (!file) return;
    try {
      onChange(await createLogoDataUrl(file));
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      onError(code === "logo.type" ? "settings.logo.invalidType" : code === "logo.size" ? "settings.logo.tooLarge" : "settings.logo.failed");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-12" data-setting-key="logo">
      <label className="w-64 text-base">{t("settings.logo")}</label>
      <div className="flex items-center gap-2">
        <div data-logo-preview="true" className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border bg-muted">
          {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <BrandMark className="h-full w-full" />}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(event) => void handleFile(event.currentTarget.files?.[0])}
        />
        <Button type="button" variant="outline" className="h-9" disabled={disabled} onClick={() => inputRef.current?.click()}>
          <ImagePlus className="h-4 w-4" />
          {t("settings.logo.change")}
        </Button>
        {value ? (
          <Button type="button" variant="ghost" size="icon" title={t("settings.logo.remove")} disabled={disabled} onClick={() => onChange(undefined)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

const accentThemeLabels = {
  pink: "settings.accentTheme.pink",
  blue: "settings.accentTheme.blue",
  purple: "settings.accentTheme.purple",
  brown: "settings.accentTheme.brown",
  green: "settings.accentTheme.green",
  summer: "settings.accentTheme.summer",
  autumn: "settings.accentTheme.autumn",
  winter: "settings.accentTheme.winter",
  spring: "settings.accentTheme.spring"
} as const;

const accentThemeSwatchClasses: Record<AccentTheme, string> = {
  pink: "accent-swatch-pink",
  blue: "accent-swatch-blue",
  purple: "accent-swatch-purple",
  brown: "accent-swatch-brown",
  green: "accent-swatch-green",
  summer: "accent-swatch-summer",
  autumn: "accent-swatch-autumn",
  winter: "accent-swatch-winter",
  spring: "accent-swatch-spring"
};

function AccentThemeSetting({
  value,
  disabled,
  onChange,
  t
}: {
  value: AccentTheme;
  disabled: boolean;
  onChange: (value: AccentTheme) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <div className="flex items-start gap-12" data-setting-key="accentTheme">
      <label className="w-64 pt-2 text-base">{t("settings.accentColor")}</label>
      <div className="grid grid-cols-5 gap-3">
        {ACCENT_THEMES.map((theme) => (
          <button
            key={theme}
            type="button"
            data-accent-option={theme}
            title={t(accentThemeLabels[theme])}
            disabled={disabled}
            onClick={() => onChange(theme)}
            className="relative flex flex-col items-center gap-1 text-xs text-muted-foreground disabled:opacity-50"
          >
            <span className={`accent-swatch ${accentThemeSwatchClasses[theme]}`}>
              {value === theme ? <Check className="h-3 w-3 text-white" /> : null}
            </span>
            <span>{t(accentThemeLabels[theme])}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const visualThemeLabels = {
  professional: "settings.visualStyle.professional",
  mica: "settings.visualStyle.mica",
  aurora: "settings.visualStyle.aurora",
  paper: "settings.visualStyle.paper",
  oled: "settings.visualStyle.oled"
} as const;

function VisualThemeSetting({
  settingKey,
  label,
  value,
  options,
  disabled,
  onChange,
  t
}: {
  settingKey: "lightVisualTheme" | "darkVisualTheme";
  label: string;
  value: VisualTheme;
  options: readonly VisualTheme[];
  disabled: boolean;
  onChange: (value: VisualTheme) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <div className="flex items-start gap-12" data-setting-key={settingKey}>
      <label className="w-64 pt-2 text-base">{label}</label>
      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={label}>
        {options.map((theme) => (
          <button
            key={theme}
            type="button"
            role="radio"
            aria-checked={value === theme}
            data-visual-option={theme}
            data-visual-mode={settingKey === "lightVisualTheme" ? "light" : "dark"}
            disabled={disabled}
            onClick={() => onChange(theme)}
            className={[
              "group relative w-28 rounded-lg border p-1.5 text-left outline-none transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              value === theme ? "border-primary shadow-sm" : "border-border"
            ].join(" ")}
          >
            <span
              className={`visual-theme-preview visual-theme-preview-${theme}`}
              data-preview-mode={settingKey === "lightVisualTheme" ? "light" : "dark"}
              aria-hidden="true"
            >
              <span className="visual-theme-preview-sidebar" />
              <span className="visual-theme-preview-content">
                <span />
                <span />
              </span>
            </span>
            <span className="mt-1 flex items-center justify-between gap-1 px-0.5 text-xs font-medium">
              {t(visualThemeLabels[theme])}
              {value === theme ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingSelect({
  settingKey,
  label,
  value,
  disabled,
  options,
  onChange
}: {
  settingKey: string;
  label: string;
  value: string;
  disabled: boolean;
  options: SettingOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-12" data-setting-key={settingKey}>
      <label className="w-64 text-base">{label}</label>
      <Select value={value} disabled={disabled} onValueChange={onChange}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function StatusLine({ state }: { state: SaveState }) {
  return (
    <p
      className={[
        "mt-6 text-sm",
        state.tone === "error" ? "text-destructive" : ""
      ].join(" ")}
    >
      {state.message}
    </p>
  );
}
