import { DatabaseBackup, Home, Info, PanelLeftClose, PanelLeftOpen, Search, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { Button } from "../ui/button";
import { SearchDialog } from "../../features/search/SearchDialog";
import { useI18n } from "../../features/i18n/useI18n";
import { applyAccentTheme } from "../../features/settings/appearance";
import { watchDocumentAppearance } from "../../features/settings/theme";
import { BrandMark } from "../brand/BrandMark";
import { useLayoutSettings } from "../../features/settings/LayoutSettingsProvider";

type AppShellProps = {
  children: ReactNode;
};

const navItems = [
  { to: "/", labelKey: "sidebar.spaces", icon: Home, activePrefix: "/space" },
  { to: "/sync", labelKey: "sidebar.backupSync", icon: DatabaseBackup, activePrefix: undefined },
  { to: "/settings", labelKey: "sidebar.settings", icon: Settings, activePrefix: undefined },
  { to: "/about", labelKey: "sidebar.about", icon: Info, activePrefix: undefined }
] as const;

export function AppShell({ children }: AppShellProps) {
  const { t } = useI18n();
  const {
    userSetting,
    isSidebarCollapsed: sidebarCollapsed,
    setSidebarCollapsed
  } = useLayoutSettings();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const useSpaceNativeSidebar =
    location.pathname === "/" ||
    location.pathname.startsWith("/space") ||
    location.pathname === "/settings" ||
    location.pathname === "/sync" ||
    location.pathname === "/about";

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setSearchOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  useEffect(() => {
    const listener = () => setSearchOpen(true);
    window.addEventListener("xingluotab:open-search", listener);
    return () => window.removeEventListener("xingluotab:open-search", listener);
  }, []);

  useEffect(
    () => watchDocumentAppearance(
      userSetting.theme,
      userSetting.lightVisualTheme,
      userSetting.darkVisualTheme
    ),
    [userSetting.darkVisualTheme, userSetting.lightVisualTheme, userSetting.theme]
  );
  useEffect(() => void applyAccentTheme(userSetting.accentTheme), [userSetting.accentTheme]);

  async function handleToggleSidebar() {
    const nextCollapsed = !sidebarCollapsed;
    await setSidebarCollapsed(nextCollapsed);
  }

  return (
    <div data-app-shell="true" className="flex h-screen bg-background text-foreground">
      {useSpaceNativeSidebar ? null : (
        <aside className={["flex shrink-0 flex-col border-r bg-card transition-[width]", sidebarCollapsed ? "w-14" : "w-64"].join(" ")}>
          <div className={["flex h-14 items-center border-b", sidebarCollapsed ? "justify-center px-2" : "justify-between px-4"].join(" ")}>
            {sidebarCollapsed ? (
              <BrandMark className="h-8 w-8 rounded-lg" />
            ) : (
              <div className="flex items-center gap-2 text-lg font-semibold">
                <BrandMark className="h-7 w-7 rounded-lg" />
                <span>{t("brand.name")}</span>
              </div>
            )}
            <Button
              size="icon"
              variant="ghost"
              title={sidebarCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
              className={sidebarCollapsed ? "hidden" : "h-8 w-8"}
              onClick={() => void handleToggleSidebar()}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
          <nav className="flex flex-1 flex-col gap-1 p-2">
            <Button
              variant="ghost"
              size={sidebarCollapsed ? "icon" : "default"}
              title={t("sidebar.searchTabs")}
              className={["h-9 text-muted-foreground", sidebarCollapsed ? "w-10 px-0" : "justify-start px-3"].join(" ")}
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-4 w-4" />
              {sidebarCollapsed ? <span className="sr-only">{t("sidebar.searchTabs")}</span> : t("sidebar.searchTabs")}
            </Button>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => {
                  const active = item.activePrefix
                    ? location.pathname === "/" || location.pathname.startsWith(item.activePrefix)
                    : isActive;
                  return [
                    "flex h-9 items-center gap-2 rounded-md text-sm",
                    sidebarCollapsed ? "w-10 justify-center px-0" : "px-3",
                    active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"
                  ].join(" ");
                }}
                title={t(item.labelKey)}
              >
                <item.icon className="h-4 w-4" />
                {sidebarCollapsed ? <span className="sr-only">{t(item.labelKey)}</span> : t(item.labelKey)}
              </NavLink>
            ))}
          </nav>
          {sidebarCollapsed ? (
            <div className="border-t p-2">
              <Button size="icon" variant="ghost" title={t("sidebar.expand")} className="h-9 w-10" onClick={() => void handleToggleSidebar()}>
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </aside>
      )}
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
