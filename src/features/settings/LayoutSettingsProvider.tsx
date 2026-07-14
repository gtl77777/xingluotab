import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  getUserSetting,
  saveUserSetting,
  USER_SETTING_STORAGE_KEY
} from "../../domain/settings/repository";

type LayoutSettingsContextValue = {
  isSidebarCollapsed: boolean;
  isSessionBarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => Promise<void>;
  setSessionBarCollapsed: (collapsed: boolean) => Promise<void>;
};

const LayoutSettingsContext = createContext<LayoutSettingsContextValue | null>(null);

export function LayoutSettingsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsedState] = useState(false);
  const [isSessionBarCollapsed, setSessionBarCollapsedState] = useState(false);

  useEffect(() => {
    let mounted = true;
    void getUserSetting()
      .then((setting) => {
        if (!mounted) return;
        setSidebarCollapsedState(setting.isSidebarCollapsed);
        setSessionBarCollapsedState(setting.isSessionBarCollapsed);
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
        const setting = JSON.parse(storedSetting as string) as {
          isSidebarCollapsed?: boolean;
          isSessionBarCollapsed?: boolean;
        };
        if (typeof setting.isSidebarCollapsed === "boolean") {
          setSidebarCollapsedState(setting.isSidebarCollapsed);
        }
        if (typeof setting.isSessionBarCollapsed === "boolean") {
          setSessionBarCollapsedState(setting.isSessionBarCollapsed);
        }
      } catch {
        // Keep the last valid in-memory layout instead of shifting to defaults.
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => {
      mounted = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  const setSidebarCollapsed = useCallback(async (collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
    try {
      const setting = await getUserSetting();
      await saveUserSetting({ ...setting, isSidebarCollapsed: collapsed });
    } catch {
      const setting = await getUserSetting().catch(() => null);
      if (setting) setSidebarCollapsedState(setting.isSidebarCollapsed);
    }
  }, []);

  const setSessionBarCollapsed = useCallback(async (collapsed: boolean) => {
    setSessionBarCollapsedState(collapsed);
    try {
      const setting = await getUserSetting();
      await saveUserSetting({ ...setting, isSessionBarCollapsed: collapsed });
    } catch {
      const setting = await getUserSetting().catch(() => null);
      if (setting) setSessionBarCollapsedState(setting.isSessionBarCollapsed);
    }
  }, []);

  const value = useMemo<LayoutSettingsContextValue>(() => ({
    isSidebarCollapsed,
    isSessionBarCollapsed,
    setSidebarCollapsed,
    setSessionBarCollapsed
  }), [isSessionBarCollapsed, isSidebarCollapsed, setSessionBarCollapsed, setSidebarCollapsed]);

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
