import { HashRouter, Navigate, Route, Routes } from "react-router";
import { useEffect, useState } from "react";
import { AppShell } from "../components/layout/AppShell";
import { SpaceSidebarPageLayout } from "../components/layout/SpaceSidebarPageLayout";
import { getUserSetting } from "../domain/settings/repository";
import { getSpaceList } from "../domain/space/repository";
import { SpaceVersionProvider, useSpaceVersion } from "../features/storage/spaceVersionStore";
import { AboutPage } from "../routes/AboutPage";
import { SettingsPage } from "../routes/SettingsPage";
import { SpacePage } from "../routes/SpacePage";
import { SyncPage } from "../routes/SyncPage";

export function App() {
  return (
    <SpaceVersionProvider>
      <HashRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<LastVisitedSpaceRedirect />} />
            <Route path="/space/:id" element={<SpacePage />} />
            <Route
              path="/sync"
              element={
                <SpaceSidebarPageLayout>
                  <SyncPage />
                </SpaceSidebarPageLayout>
              }
            />
            <Route
              path="/settings"
              element={
                <SpaceSidebarPageLayout>
                  <SettingsPage />
                </SpaceSidebarPageLayout>
              }
            />
            <Route
              path="/about"
              element={
                <SpaceSidebarPageLayout>
                  <AboutPage />
                </SpaceSidebarPageLayout>
              }
            />
            <Route path="*" element={<SpacePage missing />} />
          </Routes>
        </AppShell>
      </HashRouter>
    </SpaceVersionProvider>
  );
}

function LastVisitedSpaceRedirect() {
  const { revision } = useSpaceVersion();
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void Promise.all([getUserSetting(), getSpaceList()])
      .then(([setting, spaces]) => {
        if (!mounted) return;
        if (spaces.length === 0) {
          setTarget("/about");
          return;
        }
        const lastVisitedSpaceId = setting.lastVisitedSpaceId;
        const targetSpaceId =
          lastVisitedSpaceId && spaces.some((space) => space.id === lastVisitedSpaceId)
            ? lastVisitedSpaceId
            : spaces[0]?.id;
        setTarget(targetSpaceId ? `/space/${targetSpaceId}` : "/about");
      })
      .catch(() => {
        if (mounted) setTarget("/about");
      });
    return () => {
      mounted = false;
    };
  }, [revision]);

  return target ? <Navigate to={target} replace /> : null;
}
