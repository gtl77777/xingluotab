import {
  DatabaseBackup,
  FileUp,
  GripVertical,
  Info,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Settings
} from "lucide-react";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { NavLink, useLocation, useNavigate } from "react-router";
import { useEffect } from "react";
import type { SpaceSummary } from "../../domain/space/schema";
import { dndId, type SpaceDragData } from "../../features/dnd/dragData";
import { useI18n } from "../../features/i18n/useI18n";
import { useLayoutSettings } from "../../features/settings/LayoutSettingsProvider";
import { getAdjacentSpaceId, getSpaceNavigationDirection } from "../../features/space/navigation";
import { SpaceIcon } from "../../features/space/spaceIcons";
import { Button } from "../ui/button";
import { BrandMark } from "../brand/BrandMark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../ui/dropdown-menu";

type SpaceSidebarProps = {
  spaces: SpaceSummary[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onCreateSpace?: () => void;
  onImportSpace?: () => void;
  onImportToby?: () => void;
  onChangeSpaceIcon?: (space: SpaceSummary) => void;
  onExportSpace?: (space: SpaceSummary) => void;
  onDeleteSpace?: (space: SpaceSummary) => void;
  dndEnabled?: boolean;
};

export function SpaceSidebar({
  spaces,
  collapsed,
  onToggleCollapsed,
  onCreateSpace,
  onImportSpace,
  onImportToby,
  onChangeSpaceIcon,
  onExportSpace,
  onDeleteSpace,
  dndEnabled = false
}: SpaceSidebarProps) {
  const { t } = useI18n();
  const { userSetting } = useLayoutSettings();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const direction = getSpaceNavigationDirection(event);
      if (direction === 0) return;

      const match = location.pathname.match(/^\/space\/([^/]+)/);
      if (!match?.[1] || spaces.length === 0) return;
      const targetId = getAdjacentSpaceId(spaces, match[1], direction);
      if (!targetId) return;

      event.preventDefault();
      navigate(`/space/${targetId}`);
    };

    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [location.pathname, navigate, spaces]);

  return (
    <section
      data-space-sidebar="true"
      className={[
        "theme-sidebar flex shrink-0 flex-col border-r transition-[width,background-color] duration-200 ease-linear",
        collapsed ? "w-12" : "w-64"
      ].join(" ")}
    >
      <header data-space-sidebar-header="true" className="flex h-14 items-center border-b p-2">
        <div className="min-w-0 flex-1 overflow-hidden transition-all duration-200">
          {collapsed ? null : (
            <div className="flex items-center gap-2 whitespace-nowrap px-2 text-lg font-semibold">
              {userSetting.logoDataUrl ? (
                <img data-brand-logo="true" src={userSetting.logoDataUrl} alt="" className="h-7 w-7 rounded-lg object-cover" />
              ) : (
                <BrandMark className="h-7 w-7 rounded-lg" />
              )}
              <span>{t("brand.name")}</span>
            </div>
          )}
        </div>
        <Button
          size="icon"
          variant="ghost"
          title={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          className="h-7 w-7 shrink-0"
          onClick={() => void onToggleCollapsed()}
        >
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </header>

      {collapsed ? (
        <div data-space-sidebar-content="true" className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-hidden p-2">
          {spaces.map((space) => (
            <NavLink
              key={space.id}
              to={`/space/${space.id}`}
              title={space.name}
              aria-label={space.name}
              className={({ isActive }) =>
                [
                  "theme-sidebar-hover flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                  isActive ? "theme-sidebar-active text-foreground" : ""
                ].join(" ")
              }
            >
              <SpaceIcon name={space.icon} className="h-4 w-4 shrink-0" />
            </NavLink>
          ))}
        </div>
      ) : (
        <div data-space-sidebar-content="true" className="flex flex-1 flex-col gap-1 overflow-auto p-2">
          <div className="flex h-8 items-center justify-between px-2 text-sm text-muted-foreground">
            <span>{t("sidebar.spaces")}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" title={t("sidebar.addSpace")} className="h-7 w-7">
                  <Plus className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start">
                <DropdownMenuItem data-action="create-space" disabled={!onCreateSpace} onSelect={() => void onCreateSpace?.()}>
                  <Plus className="h-4 w-4" />
                  <span>{t("sidebar.newSpace")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem data-action="import-space" disabled={!onImportSpace} onSelect={() => onImportSpace?.()}>
                  <FileUp className="h-4 w-4" />
                  <span>{t("sidebar.importSpace")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem data-action="import-toby" disabled={!onImportToby} onSelect={() => onImportToby?.()}>
                  <FileUp className="h-4 w-4" />
                  <span>{t("sidebar.importToby")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            {dndEnabled ? (
              <SortableContext items={spaces.map((space) => dndId.space(space.id))} strategy={verticalListSortingStrategy}>
                {spaces.map((space) => (
                  <SortableSpaceRow
                    key={space.id}
                    space={space}
                    onChangeSpaceIcon={onChangeSpaceIcon}
                    onExportSpace={onExportSpace}
                    onDeleteSpace={onDeleteSpace}
                  />
                ))}
              </SortableContext>
            ) : (
              spaces.map((space) => (
                <SpaceRow
                  key={space.id}
                  space={space}
                  onChangeSpaceIcon={onChangeSpaceIcon}
                  onExportSpace={onExportSpace}
                  onDeleteSpace={onDeleteSpace}
                />
              ))
            )}
          </div>
        </div>
      )}

      <SpaceSidebarFooter collapsed={collapsed} />
    </section>
  );
}

type SpaceRowProps = {
  space: SpaceSummary;
  sortable?: ReturnType<typeof useSortable>;
  onChangeSpaceIcon?: (space: SpaceSummary) => void;
  onExportSpace?: (space: SpaceSummary) => void;
  onDeleteSpace?: (space: SpaceSummary) => void;
};

function SortableSpaceRow(props: Omit<SpaceRowProps, "sortable">) {
  const sortable = useSortable({
    id: dndId.space(props.space.id),
    data: { type: "space", spaceId: props.space.id } satisfies SpaceDragData
  });
  return <SpaceRow {...props} sortable={sortable} />;
}

function SpaceRow({ space, sortable, onChangeSpaceIcon, onExportSpace, onDeleteSpace }: SpaceRowProps) {
  const { t } = useI18n();
  return (
    <div
      ref={sortable?.setNodeRef}
      data-space-row="true"
      data-dnd-over={sortable?.isOver || undefined}
      className={[
        "group/space relative flex min-w-0 items-center rounded-md transition-colors",
        sortable?.isOver ? "bg-accent ring-1 ring-primary/50" : "",
        sortable?.isDragging ? "z-20 opacity-40" : ""
      ].join(" ")}
      style={{
        transform: CSS.Transform.toString(sortable?.transform ?? null),
        transition: sortable?.transition ?? "transform 200ms ease"
      }}
    >
      <NavLink
        to={`/space/${space.id}`}
        className={({ isActive }) =>
          [
            "theme-sidebar-hover flex h-8 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-md p-2 pr-14 text-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            isActive ? "theme-sidebar-active font-medium text-foreground" : "text-foreground"
          ].join(" ")
        }
      >
        <SpaceIcon name={space.icon} className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{space.name}</span>
      </NavLink>
      {sortable ? (
        <button
          type="button"
          data-space-drag-handle="true"
          title={t("sidebar.reorderSpace")}
          {...sortable.attributes}
          {...sortable.listeners}
          className="absolute right-7 top-1.5 flex h-5 w-5 cursor-grab items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:opacity-100 active:cursor-grabbing group-hover/space:opacity-60"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            title={t("sidebar.spaceActions")}
            data-no-dnd="true"
            className="absolute right-1 top-1.5 h-5 w-5 rounded-md p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuItem
            data-action="change-space-icon"
            disabled={!onChangeSpaceIcon}
            onSelect={() => void onChangeSpaceIcon?.(space)}
          >
            <span>{t("sidebar.changeIcon")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem data-action="export-space" disabled={!onExportSpace} onSelect={() => void onExportSpace?.(space)}>
            <span>{t("sidebar.exportSpace")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            data-action="delete-space"
            destructive
            disabled={!onDeleteSpace}
            onSelect={() => void onDeleteSpace?.(space)}
          >
            <span>{t("sidebar.deleteSpace")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function SpaceSidebarFooter({ collapsed }: { collapsed: boolean }) {
  const { t } = useI18n();

  return (
    <div data-space-sidebar-footer="true" className="mt-auto border-t p-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "default"}
            title={t("sidebar.settings")}
            data-space-sidebar-settings="true"
            className={["h-8 text-foreground", collapsed ? "w-8 px-0" : "w-full justify-start px-2"].join(" ")}
          >
            <Settings className="h-4 w-4" />
            {collapsed ? <span className="sr-only">{t("sidebar.settings")}</span> : t("sidebar.settings")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
          <DropdownMenuItem asChild>
            <NavLink to="/settings">
              <Settings className="h-4 w-4" />
              <span>{t("sidebar.settings")}</span>
            </NavLink>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <NavLink to="/sync">
              <DatabaseBackup className="h-4 w-4" />
              <span>{t("sidebar.backupSync")}</span>
            </NavLink>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <NavLink to="/about">
              <Info className="h-4 w-4" />
              <span>{t("sidebar.about")}</span>
            </NavLink>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
