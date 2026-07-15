import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  getUserSetting,
  saveUserSetting,
  USER_SETTING_STORAGE_KEY
} from "../../domain/settings/repository";
import { defaultUserSetting, type UserSetting } from "../../domain/settings/schema";

type LayoutSettingsContextValue = {
  userSetting: UserSetting;
  isSidebarCollapsed: boolean;
  isSessionBarCollapsed: boolean;
  replaceUserSetting: (setting: UserSetting) => Promise<void>;
  updateUserSetting: (patch: Partial<UserSetting>) => Promise<void>;
  setSidebarCollapsed: (collapsed: boolean) => Promise<void>;
  setSessionBarCollapsed: (collapsed: boolean) => Promise<void>;
};

const LayoutSettingsContext = createContext<LayoutSettingsContextValue | null>(null);

export function LayoutSettingsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [userSetting, setUserSettingState] = useState<UserSetting>(defaultUserSetting);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let mounted = true;
    void getUserSetting()
      .then((setting) => {
        if (!mounted) return;
        setUserSettingState(setting);
      })
      .catch(() => {
        // Render with defaults if storage is temporarily unavailable.
      })
      .finally(() => {
        if (mounted) setReady(true);
      });

    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      const storedSetting = changes[USER_SETTING_STORAGE_KEY]?.newValue;
      if (areaName !== "local" || !storedSetting) return;
      try {
        const stored = typeof storedSetting === "string"
          ? JSON.parse(storedSetting) as Partial<UserSetting>
          : storedSetting as Partial<UserSetting>;
        setUserSettingState({
          ...defaultUserSetting,
          ...stored,
          collapsedGroups: stored.collapsedGroups ?? []
        });
      } catch {
        // Keep the last valid in-memory setting instead of shifting to defaults.
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => {
      mounted = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  const persistUserSetting = useCallback((resolveNext: (current: UserSetting) => UserSetting) => {
    setUserSettingState(resolveNext);

    const operation = writeQueueRef.current.then(async () => {
      const stored = await getUserSetting();
      await saveUserSetting(resolveNext(stored));
    });
    writeQueueRef.current = operation.catch(() => undefined);

    return operation.catch(async (error) => {
      const stored = await getUserSetting().catch(() => null);
      if (stored) setUserSettingState(stored);
      throw error;
    });
  }, []);

  const replaceUserSetting = useCallback(
    (setting: UserSetting) => persistUserSetting(() => setting),
    [persistUserSetting]
  );

  const updateUserSetting = useCallback(
    (patch: Partial<UserSetting>) => persistUserSetting((current) => ({ ...current, ...patch })),
    [persistUserSetting]
  );

  const setSidebarCollapsed = useCallback(
    (collapsed: boolean) => updateUserSetting({ isSidebarCollapsed: collapsed }),
    [updateUserSetting]
  );

  const setSessionBarCollapsed = useCallback(
    (collapsed: boolean) => updateUserSetting({ isSessionBarCollapsed: collapsed }),
    [updateUserSetting]
  );

  const value = useMemo<LayoutSettingsContextValue>(() => ({
    userSetting,
    isSidebarCollapsed: userSetting.isSidebarCollapsed,
    isSessionBarCollapsed: userSetting.isSessionBarCollapsed,
    replaceUserSetting,
    updateUserSetting,
    setSidebarCollapsed,
    setSessionBarCollapsed
  }), [replaceUserSetting, setSessionBarCollapsed, setSidebarCollapsed, updateUserSetting, userSetting]);

  if (!ready) {
    return <div data-layout-settings-loading="true" className="h-screen w-full bg-background" />;
  }

  return <LayoutSettingsContext.Provider value={value}>{children}</LayoutSettingsContext.Provider>;
}

export function useLayoutSettings() {
  const value = useContext(LayoutSettingsContext);
  if (!value) throw new Error("useLayoutSettings must be used within LayoutSettingsProvider");
  return value;
}
