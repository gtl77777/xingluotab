import {
  ChevronDown,
  Edit3,
  ExternalLink,
  FolderOpen,
  GripVertical,
  LayoutGrid,
  Leaf,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  MoveRight,
  Pin,
  PinOff,
  Plus,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDndContext,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import {
  sortableKeyboardCoordinates,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  type SortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from "react";
import { useNavigate, useParams } from "react-router";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Favicon, FaviconPreview, getFaviconCacheRevision, preloadFavicons } from "../components/ui/Favicon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "../components/ui/dropdown-menu";
import { Input } from "../components/ui/input";
import { isSafeNavigationUrl } from "../lib/safeUrl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { getUserSetting, saveLastVisitedSpaceId, saveUserSetting } from "../domain/settings/repository";
import {
  addGroup,
  deleteGroup,
  deleteTab,
  moveGroup,
  moveGroupToSpace,
  moveTab,
  moveTabToSpace,
  renameGroup,
  setGroupTags,
  setGroupPinned,
  sortGroupsForDisplay,
  sortGroupsForMode,
  updateTab
} from "../domain/space/operations";
import type { RecordTab, SessionTab, Space, SpaceSummary, TabGroup } from "../domain/space/schema";
import {
  getSpace,
  getSpaceList,
  renameSpace,
  reorderSpace,
  saveSpace,
  saveSpaceTransfer
} from "../domain/space/repository";
import { searchTabs, buildSearchIndex, type SearchRecord } from "../features/search/searchIndex";
import {
  dndId,
  isXingLuoTabDragData,
  type GroupDragData,
  type SpaceDragData,
  type TabDragData,
  type XingLuoTabDragData
} from "../features/dnd/dragData";
import { createBufferedCollisionDetection } from "../features/dnd/bufferedCollision";
import { getSameGroupDropIndex, getTabInsertionIndex, getTabInsertionIndexFromPointer } from "../features/dnd/tabDrop";
import { useI18n } from "../features/i18n/useI18n";
import {
  COLLECTION_SORTS,
  COLLECTION_VIEWS,
  ZEN_THEMES,
  type CollectionSort,
  type CollectionView,
  type ZenTheme
} from "../features/settings/appearance";
import { useLayoutSettings } from "../features/settings/LayoutSettingsProvider";
import { SpaceIcon } from "../features/space/spaceIcons";
import { useSpaceVersion } from "../features/storage/spaceVersionStore";
import { SessionBar } from "../features/tabs/SessionBar";
import { getCurrentWindowSessionTabs, tabToSessionTab } from "../features/tabs/sessionTabs";
import { appendSessionTabsAsGroup, appendSessionTabsToGroup } from "../features/tabs/saveSessionGroup";
import { activateBrowserTab, openUrl, openUrlsInTabs, removeBrowserTabs, watchCurrentWindowTabs } from "../platform/browser";

type SpacePageProps = {
  missing?: boolean;
};

type Translate = ReturnType<typeof useI18n>["t"];

type SpaceState = {
  loading: boolean;
  list: SpaceSummary[];
  space: Space | null;
  error: string | null;
  action: string | null;
};

type SpaceNameDialogState = {
  space: SpaceSummary;
  name: string;
} | null;

type GroupNameDialogState = {
  group: TabGroup;
  name: string;
} | null;

type TabEditDialogState = {
  tab: RecordTab;
  title: string;
  url: string;
} | null;

type GroupTagsDialogState = {
  group: TabGroup;
  tags: string;
} | null;

type ConfirmDialogState = {
  title: string;
  description: string;
  confirmText?: string;
  onConfirm: () => void | Promise<void>;
} | null;

type TabMoveDialogState = {
  tabId: string;
  sourceGroupId: string;
  targetSpaceId: string;
  targetSpace: Space | null;
  targetGroupId: string;
  loading: boolean;
} | null;

type TabDropPreview = {
  tabId: string;
  targetGroupId: string;
  targetIndex: number;
} | null;

const defaultState: SpaceState = {
  loading: true,
  list: [],
  space: null,
  error: null,
  action: null
};

const spaceStateCache = new Map<string, SpaceState>();
let sessionTabsCache: SessionTab[] = [];

const CARD_GRID_VIRTUALIZATION_THRESHOLD = 60;
const GROUP_CHROME_HEIGHT = 64;
const DND_SCROLL_SETTLE_MS = 180;
const DND_EDGE_SCROLL_MAX_PX_PER_SECOND = 480;
const DND_EDGE_SCROLL_ZONE_PX = 80;
const DND_EDGE_SCROLL_DWELL_MS = 180;
const DND_EDGE_SCROLL_DWELL_RESET_DISTANCE_PX = 8;
const NO_TAG_FILTER = "__no_tags__";
const STATIC_TAB_SORTING_STRATEGY: SortingStrategy = () => null;

const VIEW_METRICS: Record<CollectionView, { minWidth: number; gap: number; cardHeight: number; rowHeight: number; estimatedColumns: number }> = {
  card: { minWidth: 192, gap: 16, cardHeight: 56, rowHeight: 72, estimatedColumns: 3 },
  list: { minWidth: 0, gap: 8, cardHeight: 44, rowHeight: 52, estimatedColumns: 1 },
  compact: { minWidth: 160, gap: 8, cardHeight: 40, rowHeight: 48, estimatedColumns: 4 },
  grid: { minWidth: 128, gap: 8, cardHeight: 48, rowHeight: 56, estimatedColumns: 5 }
};

const ZEN_THEME_CLASSES: Record<ZenTheme, string> = {
  minimal: "zen-theme-minimal",
  ghibli: "zen-theme-ghibli",
  glass: "zen-theme-glass"
};

function scrollGroupContentByWheel(scroller: HTMLDivElement, deltaY: number, deltaMode: number) {
  const modeScale = deltaMode === 1 ? 24 : deltaMode === 2 ? scroller.clientHeight * 0.8 : 1;
  const requestedDelta = deltaY * modeScale;
  const maxStep = Math.max(56, Math.min(72, scroller.clientHeight * 0.12));
  scroller.scrollTop += Math.max(-maxStep, Math.min(maxStep, requestedDelta));
}

export function SpacePage({ missing }: SpacePageProps) {
  const { t } = useI18n();
  const {
    userSetting,
    isSessionBarCollapsed,
    setSessionBarCollapsed,
    updateUserSetting
  } = useLayoutSettings();
  const { revision } = useSpaceVersion();
  const { id } = useParams();
  const navigate = useNavigate();
  const requestedSpaceId = missing ? "default" : id ?? "default";
  const [state, setState] = useState<SpaceState>(() => {
    const cached = spaceStateCache.get(requestedSpaceId);
    return cached ? { ...cached, loading: false, error: null, action: null } : { ...defaultState };
  });
  const [query, setQuery] = useState("");
  const [sessionTabs, setSessionTabs] = useState<SessionTab[]>(() =>
    userSetting.showPinnedSessionTab === "always"
      ? sessionTabsCache
      : sessionTabsCache.filter((tab) => !tab.pinned)
  );
  const [sessionTabSort, setSessionTabSort] = useState<"asc" | "desc">(userSetting.sessionTabSort ?? "desc");
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<string[]>(userSetting.collapsedGroups);
  const [isGroupLayoutAnimating, setGroupLayoutAnimating] = useState(false);
  const [collectionView, setCollectionView] = useState<CollectionView>(userSetting.collectionView ?? "card");
  const [estimatedGroupColumns, setEstimatedGroupColumns] = useState(
    VIEW_METRICS[userSetting.collectionView ?? "card"].estimatedColumns
  );
  const [collectionSort, setCollectionSort] = useState<CollectionSort>(userSetting.collectionSort ?? "manual");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [isZenMode, setZenMode] = useState(userSetting.zenMode ?? false);
  const [zenTheme, setZenTheme] = useState<ZenTheme>(userSetting.zenTheme ?? "minimal");
  const [spaceNameDialog, setSpaceNameDialog] = useState<SpaceNameDialogState>(null);
  const [groupNameDialog, setGroupNameDialog] = useState<GroupNameDialogState>(null);
  const [groupTagsDialog, setGroupTagsDialog] = useState<GroupTagsDialogState>(null);
  const [tabEditDialog, setTabEditDialog] = useState<TabEditDialogState>(null);
  const [tabMoveDialog, setTabMoveDialog] = useState<TabMoveDialogState>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [activeDrag, setActiveDrag] = useState<XingLuoTabDragData | null>(null);
  const groupScrollRef = useRef<HTMLDivElement>(null);
  const activeDragRef = useRef<XingLuoTabDragData | null>(null);
  const dragOriginSpaceRef = useRef<Space | null>(null);
  const tabDropPreviewRef = useRef<TabDropPreview>(null);
  const tabDropPreviewElementRef = useRef<HTMLElement | null>(null);
  const pendingTabDropPreviewVisualRef = useRef<TabDropPreview>(null);
  const tabDropPreviewFrameRef = useRef<number | null>(null);
  const deferredSpaceRefreshRef = useRef(false);
  const suppressNextSpaceVersionRefreshRef = useRef(false);
  const lastLoadedRevisionRef = useRef(revision);
  const sessionTabsRequestRef = useRef(0);
  const includePinnedSessionTabsRef = useRef(userSetting.showPinnedSessionTab === "always");
  const groupLayoutAnimationTimerRef = useRef<number | null>(null);
  const dndScrollSettleTimerRef = useRef<number | null>(null);
  const dndEdgeScrollFrameRef = useRef<number | null>(null);
  const dndEdgeScrollSpeedRef = useRef(0);
  const dndEdgeScrollLastFrameRef = useRef<number | null>(null);
  const dndEdgeScrollDirectionRef = useRef(0);
  const dndEdgeScrollEnteredAtRef = useRef<number | null>(null);
  const dndEdgeScrollLastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const dndPointerRef = useRef<{ x: number; y: number } | null>(null);
  const collapsedGroupIdsRef = useRef<string[]>(userSetting.collapsedGroups);
  const collapsedGroupsPersistenceRef = useRef<Promise<void>>(Promise.resolve());
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (!state.loading && state.space) {
      spaceStateCache.set(state.space.id, { ...state, action: null });
    }
  }, [state]);

  useEffect(() => {
    sessionTabsCache = sessionTabs;
  }, [sessionTabs]);

  useEffect(() => () => {
    if (groupLayoutAnimationTimerRef.current != null) {
      window.clearTimeout(groupLayoutAnimationTimerRef.current);
    }
    if (tabDropPreviewFrameRef.current != null) {
      window.cancelAnimationFrame(tabDropPreviewFrameRef.current);
    }
    if (dndScrollSettleTimerRef.current != null) {
      window.clearTimeout(dndScrollSettleTimerRef.current);
    }
    stopDndEdgeAutoScroll();
    xingLuoTabCollisionController.setSuspended(false);
  }, []);

  useEffect(() => {
    if (!activeDrag) return;
    const handleWindowPointerMove = (event: PointerEvent) => {
      const pointer = { x: event.clientX, y: event.clientY };
      dndPointerRef.current = pointer;
      updateDndEdgeAutoScroll(pointer);
    };
    const handleWindowWheel = (event: WheelEvent) => {
      const scroller = groupScrollRef.current;
      if (!scroller || event.ctrlKey || event.deltaY === 0) return;
      if (event.target instanceof Node && scroller.contains(event.target)) return;
      event.preventDefault();
      stopDndEdgeAutoScroll();
      scrollGroupContentByWheel(scroller, event.deltaY, event.deltaMode);
    };
    window.addEventListener("pointermove", handleWindowPointerMove, { capture: true });
    window.addEventListener("wheel", handleWindowWheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove, { capture: true });
      window.removeEventListener("wheel", handleWindowWheel, { capture: true });
    };
  }, [activeDrag]);

  const load = useCallback(async () => {
    const isVersionRefresh = lastLoadedRevisionRef.current !== revision;
    lastLoadedRevisionRef.current = revision;
    if (isVersionRefresh && suppressNextSpaceVersionRefreshRef.current) {
      suppressNextSpaceVersionRefreshRef.current = false;
      return;
    }
    setState((current) => ({ ...current, loading: current.space == null, error: null }));
    try {
      const requestedId = missing ? "default" : id ?? "default";
      const list = await getSpaceList();
      if (list.length === 0) {
        setState({ loading: false, list: [], space: null, error: null, action: null });
        navigate("/about", { replace: true });
        return;
      }
      let selectedId = requestedId;

      if (requestedId === "default" && list.length > 0 && !list.some((space) => space.id === "default")) {
        const firstSpace = list[0];
        if (firstSpace) selectedId = firstSpace.id;
      }

      const space = await getSpace(selectedId);

      if (space) {
        await saveLastVisitedSpaceId(space.id);
      }

      if (activeDragRef.current) {
        deferredSpaceRefreshRef.current = true;
        return;
      }
      setState({ loading: false, list, space, error: null, action: null });
    } catch (error) {
      setState({
        loading: false,
        list: [],
        space: null,
        error: t("common.operationFailed"),
        action: null
      });
    }
  }, [id, missing, navigate, revision, t]);

  const loadSessionTabs = useCallback(async () => {
    const requestId = ++sessionTabsRequestRef.current;
    try {
      const nextSessionTabs = await getCurrentWindowSessionTabs({
        includePinned: includePinnedSessionTabsRef.current
      });
      if (requestId !== sessionTabsRequestRef.current) return;
      setSessionTabs(nextSessionTabs);
    } catch {
      if (requestId === sessionTabsRequestRef.current) setSessionTabs([]);
    }
  }, []);

  const loadPageSettings = useCallback(() => {
    includePinnedSessionTabsRef.current = userSetting.showPinnedSessionTab === "always";
    setSessionTabSort(userSetting.sessionTabSort ?? "desc");
    collapsedGroupIdsRef.current = userSetting.collapsedGroups;
    setCollapsedGroupIds(userSetting.collapsedGroups);
    setCollectionView(userSetting.collectionView ?? "card");
    setCollectionSort(userSetting.collectionSort ?? "manual");
    setZenMode(userSetting.zenMode ?? false);
    setZenTheme(userSetting.zenTheme ?? "minimal");
    if (!includePinnedSessionTabsRef.current) {
      setSessionTabs((current) => current.filter((tab) => !tab.pinned));
    }
  }, [userSetting]);

  const updateSessionTabFromBrowser = useCallback((tabId: number, browserTab: chrome.tabs.Tab) => {
    setSessionTabs((current) =>
      current.flatMap((tab) => {
        if (tab.tid !== tabId.toString()) return [tab];
        const updated = tabToSessionTab(
          {
            ...browserTab,
            id: tabId,
            title: browserTab.title ?? tab.title,
            url: browserTab.url ?? browserTab.pendingUrl ?? tab.url,
            favIconUrl: browserTab.favIconUrl ?? tab.favIconUrl,
            pinned: browserTab.pinned ?? tab.pinned
          },
          {
            includePinned: includePinnedSessionTabsRef.current,
            idFactory: () => tab.id
          }
        );
        return updated ? [updated] : [];
      })
    );
  }, []);

  async function handleSaveCurrentWindow() {
    if (!state.space) return;

    setState((current) => ({ ...current, action: t("common.saving") }));
    try {
      const setting = await getUserSetting();
      const includePinned = setting.showPinnedSessionTab === "always";
      const sessionTabs = await getCurrentWindowSessionTabs({ includePinned });
      const result = appendSessionTabsAsGroup(state.space, sessionTabs, {
        keepPinnedBrowserTabs: includePinned
      });

      await saveSpace(result.space);
      await removeBrowserTabs(result.removableBrowserTabIds);
      await loadSessionTabs();
      setState((current) => ({
        ...current,
        space: result.space,
        action: t("session.savedTabs", { count: result.group.tabs.length })
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        action: t("common.operationFailed")
      }));
    }
  }

  async function handleActivateSessionTab(tab: SessionTab) {
    await activateBrowserTab(Number(tab.tid));
  }

  async function handleCloseSessionTab(tab: SessionTab) {
    await removeBrowserTabs([Number(tab.tid)]);
    await loadSessionTabs();
  }

  async function saveSessionTabsAsGroup(tabs: SessionTab[]) {
    if (!state.space) return;
    setState((current) => ({ ...current, action: t("common.saving") }));
    try {
      const setting = await getUserSetting();
      const includePinned = setting.showPinnedSessionTab === "always";
      const result = appendSessionTabsAsGroup(state.space, tabs, {
        keepPinnedBrowserTabs: includePinned
      });
      await saveSpace(result.space);
      await removeBrowserTabs(result.removableBrowserTabIds);
      await loadSessionTabs();
      setState((current) => ({
        ...current,
        space: result.space,
        action: t("session.savedTabs", { count: result.group.tabs.length })
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        action: t("common.operationFailed")
      }));
    }
  }

  async function handleMoveSessionTabToGroup(groupId: string, sessionTabId: string, targetIndex?: number) {
    if (!state.space) return;

    const tab = sessionTabs.find((item) => item.id === sessionTabId);
    if (!tab) return;

    setState((current) => ({ ...current, action: t("common.saving") }));
    try {
      const setting = await getUserSetting();
      const includePinned = setting.showPinnedSessionTab === "always";
      const result = appendSessionTabsToGroup(state.space, groupId, [tab], {
        keepPinnedBrowserTabs: includePinned
      });
      const nextSpace = targetIndex == null ? result.space : moveTab(result.space, tab.id, groupId, targetIndex);
      await saveSpace(nextSpace);
      await removeBrowserTabs(result.removableBrowserTabIds);
      await loadSessionTabs();
      setState((current) => ({
        ...current,
        space: nextSpace,
        action: t("common.saved")
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        action: t("common.operationFailed")
      }));
    }
  }

  async function commitSpace(space: Space, action: string) {
    await saveSpace(space);
    setState((current) => ({
      ...current,
      space,
      action
    }));
  }

  async function commitDraggedSpace(space: Space, action: string) {
    const origin = dragOriginSpaceRef.current ?? state.space;
    suppressNextSpaceVersionRefreshRef.current = true;
    setState((current) => ({ ...current, space, action }));

    try {
      await saveSpace(space);
    } catch (error) {
      suppressNextSpaceVersionRefreshRef.current = false;
      setState((current) => ({
        ...current,
        space: origin,
        action: t("common.operationFailed")
      }));
      throw error;
    }
  }

  async function handleOpenTab(tab: RecordTab, event: MouseEvent) {
    event.preventDefault();
    if (!state.space) return;
    const setting = await getUserSetting();
    const removeWithAlt = event.altKey && setting.removeWhenClickWithAlt === "yes";
    const background = event.ctrlKey || event.metaKey || removeWithAlt;
    await openUrl(tab.url, {
      active: !background,
      replaceCurrent: !background && setting.openTabMode === "replace"
    });
    if (removeWithAlt) {
      await commitSpace(deleteTab(state.space, tab.id), t("space.deleted"));
    }
  }

  async function handleOpenGroup(group: TabGroup, event: MouseEvent) {
    event.preventDefault();
    if (!state.space) return;
    const setting = await getUserSetting();
    await openUrlsInTabs(
      group.tabs.map((tab) => tab.url),
      {
        active: false,
        groupTitle: setting.openGroupMode === "group" ? group.name : undefined
      }
    );
    if (event.altKey && setting.removeWhenClickWithAlt === "yes") {
      await commitSpace(deleteGroup(state.space, group.id), t("space.deleted"));
    }
  }

  async function handleCreateGroup() {
    if (!state.space) return;
    await commitSpace(addGroup(state.space), t("space.updated"));
  }

  function handleRenameGroup(group: TabGroup) {
    if (!state.space) return;
    setGroupNameDialog({ group, name: group.name });
  }

  async function handleSubmitGroupNameDialog(event: FormEvent) {
    event.preventDefault();
    if (!state.space || !groupNameDialog) return;

    const nextName = groupNameDialog.name.trim();
    if (!nextName) return;
    setGroupNameDialog(null);
    if (nextName === groupNameDialog.group.name) return;
    await commitSpace(renameGroup(state.space, groupNameDialog.group.id, nextName), t("space.updated"));
  }

  function handleDeleteGroup(group: TabGroup) {
    if (!state.space) return;
    const sourceSpace = state.space;
    setConfirmDialog({
      title: t("space.deleteGroup"),
      description: t("space.deleteWarning"),
      confirmText: t("common.delete"),
      onConfirm: async () => {
        await commitSpace(deleteGroup(sourceSpace, group.id), t("space.deleted"));
      }
    });
  }

  async function handleMoveGroupToSpaceId(group: TabGroup, targetSpaceId: string) {
    if (!state.space) return;

    const targetSummary = state.list.find((space) => space.id === targetSpaceId);
    if (!targetSummary || targetSummary.id === state.space.id) return;

    const targetSpace = await getSpace(targetSummary.id);
    if (!targetSpace) {
      setState((current) => ({ ...current, action: t("space.notFound") }));
      return;
    }

    const result = moveGroupToSpace(state.space, targetSpace, group.id);
    if (result.sourceSpace === state.space && result.targetSpace === targetSpace) return;

    try {
      await saveSpaceTransfer({
        sourceBefore: state.space,
        targetBefore: targetSpace,
        sourceAfter: result.sourceSpace,
        targetAfter: result.targetSpace
      });
      setState((current) => ({
        ...current,
        space: result.sourceSpace,
        action: t("space.moved")
      }));
    } catch {
      setState((current) => ({ ...current, action: t("common.operationFailed") }));
    }
  }

  async function openTabMoveDialog(tabId: string, preferredSpaceId?: string) {
    if (!state.space) return;
    const sourceGroup = state.space.groups.find((group) => group.tabs.some((tab) => tab.id === tabId));
    if (!sourceGroup) return;
    const currentSpaceGroups = sortGroupsForDisplay(state.space).filter((group) => group.id !== sourceGroup.id);
    const targetSummary =
      state.list.find((space) => space.id === preferredSpaceId) ??
      (currentSpaceGroups.length > 0 ? state.list.find((space) => space.id === state.space?.id) : undefined) ??
      state.list.find((space) => space.id !== state.space?.id);
    if (!targetSummary) {
      setState((current) => ({ ...current, action: t("space.notFound") }));
      return;
    }

    const isCurrentSpace = targetSummary.id === state.space.id;
    const initialTargetSpace = isCurrentSpace ? state.space : null;
    const initialGroups = initialTargetSpace
      ? sortGroupsForDisplay(initialTargetSpace).filter((group) => group.id !== sourceGroup.id)
      : [];
    setTabMoveDialog({
      tabId,
      sourceGroupId: sourceGroup.id,
      targetSpaceId: targetSummary.id,
      targetSpace: initialTargetSpace,
      targetGroupId: initialGroups[0]?.id ?? "",
      loading: !isCurrentSpace
    });
    if (isCurrentSpace) return;
    const targetSpace = await getSpace(targetSummary.id);
    const firstGroup = targetSpace ? sortGroupsForDisplay(targetSpace)[0] : undefined;
    setTabMoveDialog((current) =>
      current?.tabId === tabId && current.targetSpaceId === targetSummary.id
        ? {
            ...current,
            targetSpace,
            targetGroupId: firstGroup?.id ?? "",
            loading: false
          }
        : current
    );
  }

  async function handleChangeTabMoveSpace(targetSpaceId: string) {
    if (targetSpaceId === state.space?.id) {
      setTabMoveDialog((current) => {
        if (!current || !state.space) return current;
        const firstGroup = sortGroupsForDisplay(state.space).find((group) => group.id !== current.sourceGroupId);
        return {
          ...current,
          targetSpaceId,
          targetSpace: state.space,
          targetGroupId: firstGroup?.id ?? "",
          loading: false
        };
      });
      return;
    }
    setTabMoveDialog((current) =>
      current
        ? {
            ...current,
            targetSpaceId,
            targetSpace: null,
            targetGroupId: "",
            loading: true
          }
        : current
    );
    const targetSpace = await getSpace(targetSpaceId);
    const firstGroup = targetSpace ? sortGroupsForDisplay(targetSpace)[0] : undefined;
    setTabMoveDialog((current) =>
      current?.targetSpaceId === targetSpaceId
        ? {
            ...current,
            targetSpace,
            targetGroupId: firstGroup?.id ?? "",
            loading: false
          }
        : current
    );
  }

  async function handleConfirmTabMove() {
    if (!state.space || !tabMoveDialog?.targetGroupId) return;
    if (tabMoveDialog.targetSpaceId === state.space.id) {
      const targetGroup = state.space.groups.find((group) => group.id === tabMoveDialog.targetGroupId);
      if (!targetGroup || targetGroup.id === tabMoveDialog.sourceGroupId) return;
      const nextSpace = moveTab(
        state.space,
        tabMoveDialog.tabId,
        targetGroup.id,
        targetGroup.tabs.length
      );
      if (nextSpace === state.space) return;
      await commitSpace(nextSpace, t("space.moved"));
      setTabMoveDialog(null);
      return;
    }
    const targetSpace = await getSpace(tabMoveDialog.targetSpaceId);
    if (!targetSpace) {
      setState((current) => ({ ...current, action: t("space.notFound") }));
      return;
    }

    const targetGroup = targetSpace.groups.find((group) => group.id === tabMoveDialog.targetGroupId);
    if (!targetGroup) return;
    const result = moveTabToSpace(
      state.space,
      targetSpace,
      tabMoveDialog.tabId,
      tabMoveDialog.targetGroupId,
      targetGroup.tabs.length
    );
    if (result.sourceSpace === state.space && result.targetSpace === targetSpace) return;

    try {
      await saveSpaceTransfer({
        sourceBefore: state.space,
        targetBefore: targetSpace,
        sourceAfter: result.sourceSpace,
        targetAfter: result.targetSpace
      });
      setTabMoveDialog(null);
      setState((current) => ({
        ...current,
        space: result.sourceSpace,
        action: t("space.moved")
      }));
    } catch {
      setState((current) => ({ ...current, action: t("common.operationFailed") }));
    }
  }

  async function handleTogglePin(group: TabGroup) {
    if (!state.space) return;
    await commitSpace(setGroupPinned(state.space, group.id, state.space.pins[group.id] == null), t("space.updated"));
  }

  function handleDeleteTab(tab: RecordTab) {
    if (!state.space) return;
    const sourceSpace = state.space;
    setConfirmDialog({
      title: t("space.deleteTab"),
      description: t("space.deleteWarning"),
      confirmText: t("common.delete"),
      onConfirm: async () => {
        await commitSpace(deleteTab(sourceSpace, tab.id), t("space.deleted"));
      }
    });
  }

  function handleEditTabTitle(tab: RecordTab) {
    if (!state.space) return;
    setTabEditDialog({ tab, title: tab.title, url: tab.url });
  }

  async function handleSubmitTabEditDialog(event: FormEvent) {
    event.preventDefault();
    if (!state.space || !tabEditDialog) return;

    const nextTitle = tabEditDialog.title.trim();
    const nextUrl = tabEditDialog.url.trim();
    if (!nextTitle || !nextUrl) return;
    if (!isSafeNavigationUrl(nextUrl)) {
      setState((current) => ({ ...current, action: t("common.validationFailed") }));
      return;
    }

    setTabEditDialog(null);
    if (nextTitle === tabEditDialog.tab.title && nextUrl === tabEditDialog.tab.url) return;
    await commitSpace(updateTab(state.space, tabEditDialog.tab.id, { title: nextTitle, url: nextUrl }), t("space.updated"));
  }

  async function handleOpenSearchResult(row: SearchRecord, event: MouseEvent) {
    event.preventDefault();
    if (!state.space) return;
    const setting = await getUserSetting();
    const background = event.ctrlKey || event.metaKey;
    await openUrl(row.url, {
      active: !background,
      replaceCurrent: !background && setting.openTabMode === "replace"
    });
    if (event.altKey && setting.removeWhenClickWithAlt === "yes") {
      await commitSpace(deleteTab(state.space, row.tabId), t("space.deleted"));
    }
  }

  async function handleSubmitSpaceNameDialog(event: FormEvent) {
    event.preventDefault();
    if (!spaceNameDialog) return;

    const name = spaceNameDialog.name.trim();
    if (!name) return;
    setSpaceNameDialog(null);

    if (name === spaceNameDialog.space.name) return;
    try {
      const result = await renameSpace(spaceNameDialog.space.id, name);

      setState((current) => ({
        ...current,
        list: result.list,
        space:
          current.space?.id === spaceNameDialog.space.id
            ? result.space ?? { ...current.space, name }
            : current.space,
        action: t("space.updated")
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        action: t("common.operationFailed")
      }));
    }
  }

  function handleRenameSpace(space: SpaceSummary) {
    setSpaceNameDialog({ space, name: space.name });
  }

  function handleGroupContentScroll() {
    if (!activeDragRef.current) return;
    xingLuoTabCollisionController.setSuspended(true);
    tabDropPreviewRef.current = null;
    cancelScheduledTabDropPreviewVisual();
    clearTabDropPreviewVisual();
    if (dndScrollSettleTimerRef.current != null) {
      window.clearTimeout(dndScrollSettleTimerRef.current);
    }
    dndScrollSettleTimerRef.current = window.setTimeout(() => {
      dndScrollSettleTimerRef.current = null;
      xingLuoTabCollisionController.setSuspended(false);
    }, DND_SCROLL_SETTLE_MS);
  }

  function handleGroupContentWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!activeDragRef.current || event.ctrlKey || event.deltaY === 0) return;
    event.preventDefault();
    stopDndEdgeAutoScroll();
    scrollGroupContentByWheel(event.currentTarget, event.deltaY, event.deltaMode);
  }

  function stopDndEdgeAutoScroll(resumeCollisions = false) {
    const wasRunning = dndEdgeScrollFrameRef.current != null || dndEdgeScrollEnteredAtRef.current != null;
    dndEdgeScrollSpeedRef.current = 0;
    dndEdgeScrollLastFrameRef.current = null;
    dndEdgeScrollDirectionRef.current = 0;
    dndEdgeScrollEnteredAtRef.current = null;
    dndEdgeScrollLastPointerRef.current = null;
    if (dndEdgeScrollFrameRef.current != null) {
      window.cancelAnimationFrame(dndEdgeScrollFrameRef.current);
      dndEdgeScrollFrameRef.current = null;
    }
    if (resumeCollisions && wasRunning && activeDragRef.current) clearDndScrollSuspension();
  }

  function runDndEdgeAutoScroll(timestamp: number) {
    const scroller = groupScrollRef.current;
    const speed = dndEdgeScrollSpeedRef.current;
    if (!activeDragRef.current || !scroller || speed === 0) {
      stopDndEdgeAutoScroll();
      return;
    }

    const previousTimestamp = dndEdgeScrollLastFrameRef.current ?? timestamp - 16.7;
    dndEdgeScrollLastFrameRef.current = timestamp;
    const enteredAt = dndEdgeScrollEnteredAtRef.current ?? timestamp;
    if (timestamp - enteredAt < DND_EDGE_SCROLL_DWELL_MS) {
      dndEdgeScrollFrameRef.current = window.requestAnimationFrame(runDndEdgeAutoScroll);
      return;
    }
    const elapsedSeconds = Math.min(32, Math.max(0, timestamp - previousTimestamp)) / 1000;
    const previousScrollTop = scroller.scrollTop;
    scroller.scrollTop += speed * elapsedSeconds;
    if (scroller.scrollTop === previousScrollTop) {
      stopDndEdgeAutoScroll(true);
      return;
    }
    dndEdgeScrollFrameRef.current = window.requestAnimationFrame(runDndEdgeAutoScroll);
  }

  function updateDndEdgeAutoScroll(pointerOverride?: { x: number; y: number }) {
    const scroller = groupScrollRef.current;
    const pointer = pointerOverride ?? dndPointerRef.current ?? xingLuoTabCollisionController.getLatestPointer();
    if (!scroller || !pointer) {
      stopDndEdgeAutoScroll(true);
      return;
    }

    const rect = scroller.getBoundingClientRect();
    const horizontalInset = Math.min(32, rect.width * 0.05);
    if (pointer.x < rect.left + horizontalInset || pointer.x > rect.right - horizontalInset) {
      stopDndEdgeAutoScroll(true);
      return;
    }
    const edgeSize = DND_EDGE_SCROLL_ZONE_PX;
    const topProximity = Math.max(0, Math.min(1, (rect.top + edgeSize - pointer.y) / edgeSize));
    const bottomProximity = Math.max(0, Math.min(1, (pointer.y - (rect.bottom - edgeSize)) / edgeSize));
    const proximity = Math.max(topProximity, bottomProximity);
    if (proximity === 0) {
      stopDndEdgeAutoScroll(true);
      return;
    }
    const direction = bottomProximity > topProximity ? 1 : -1;
    const previousPointer = dndEdgeScrollLastPointerRef.current;
    const movedDistanceSquared = previousPointer
      ? (pointer.x - previousPointer.x) ** 2 + (pointer.y - previousPointer.y) ** 2
      : Number.POSITIVE_INFINITY;
    if (
      direction !== dndEdgeScrollDirectionRef.current ||
      movedDistanceSquared >= DND_EDGE_SCROLL_DWELL_RESET_DISTANCE_PX ** 2
    ) {
      dndEdgeScrollDirectionRef.current = direction;
      dndEdgeScrollEnteredAtRef.current = performance.now();
      dndEdgeScrollLastPointerRef.current = { ...pointer };
    }
    dndEdgeScrollSpeedRef.current = direction * DND_EDGE_SCROLL_MAX_PX_PER_SECOND * Math.pow(proximity, 0.7);
    if (dndEdgeScrollFrameRef.current == null) {
      dndEdgeScrollLastFrameRef.current = performance.now();
      dndEdgeScrollFrameRef.current = window.requestAnimationFrame(runDndEdgeAutoScroll);
    }
  }

  function handleDndDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (!isXingLuoTabDragData(data)) return;

    clearDndScrollSuspension();
    xingLuoTabCollisionController.reset();
    activeDragRef.current = data;
    dragOriginSpaceRef.current = state.space;
    tabDropPreviewRef.current = null;
    cancelScheduledTabDropPreviewVisual();
    clearTabDropPreviewVisual();
    const activator = event.activatorEvent as Event & { clientX?: number; clientY?: number };
    dndPointerRef.current = typeof activator.clientX === "number" && typeof activator.clientY === "number"
      ? { x: activator.clientX, y: activator.clientY }
      : null;
    setActiveDrag(data);
  }

  function handleDndDragOver(event: DragOverEvent) {
    const activeData = activeDragRef.current;
    const over = event.over;
    const overData = over?.data.current;
    if (activeData?.type !== "tab") return;
    if (!over || !isXingLuoTabDragData(overData)) {
      if (tabDropPreviewRef.current) {
        tabDropPreviewRef.current = null;
        scheduleTabDropPreviewVisual(null);
      }
      return;
    }

    const currentSpace = dragOriginSpaceRef.current;
    if (
      !currentSpace ||
      overData.type === "space" ||
      ((overData.type === "tab" || overData.type === "group") && overData.spaceId !== currentSpace.id)
    ) {
      if (tabDropPreviewRef.current) {
        tabDropPreviewRef.current = null;
        scheduleTabDropPreviewVisual(null);
      }
      return;
    }
    if (overData.type !== "tab" && overData.type !== "group") return;
    if (overData.type === "tab" && overData.tabId === activeData.tabId) return;

    const targetGroupId = overData.groupId;
    const targetGroup = currentSpace.groups.find((group) => group.id === targetGroupId);
    if (!targetGroup) return;

    let targetIndex = targetGroup.tabs.length;
    if (overData.type === "tab") {
      const overIndex = targetGroup.tabs.findIndex((tab) => tab.id === overData.tabId);
      if (overIndex === -1) return;
      if (activeData.groupId === targetGroupId) {
        const sourceIndex = targetGroup.tabs.findIndex((tab) => tab.id === activeData.tabId);
        targetIndex = getSameGroupDropIndex(sourceIndex, overIndex);
      } else {
        const pointer = xingLuoTabCollisionController.getLatestPointer();
        targetIndex = pointer
          ? getTabInsertionIndexFromPointer(overIndex, pointer, over.rect, collectionView === "list" ? "vertical" : "horizontal")
          : getTabInsertionIndex(overIndex, event.active.rect.current.translated, over.rect);
      }
    }

    const nextPreview = { tabId: activeData.tabId, targetGroupId, targetIndex };
    const currentPreview = tabDropPreviewRef.current;
    if (
      currentPreview?.tabId === nextPreview.tabId &&
      currentPreview.targetGroupId === nextPreview.targetGroupId &&
      currentPreview.targetIndex === nextPreview.targetIndex
    ) {
      return;
    }
    tabDropPreviewRef.current = nextPreview;
    scheduleTabDropPreviewVisual(activeData.groupId === nextPreview.targetGroupId ? null : nextPreview);
  }

  async function handleDndDragEnd(event: DragEndEvent) {
    const activeData = activeDragRef.current;
    const hasAcceptedDropTarget = Boolean(
      event.over && xingLuoTabCollisionController.isLatestPointerWithin(event.over.rect)
    );
    const latestCollision = xingLuoTabCollisionController.getLatestCollision();
    const latestDroppable = latestCollision?.data?.droppableContainer;
    const latestRect = latestDroppable?.rect.current;
    const hasLatestDropTarget = Boolean(
      latestRect && xingLuoTabCollisionController.isLatestPointerWithin(latestRect)
    );
    const overData = hasAcceptedDropTarget
      ? event.over?.data.current
      : hasLatestDropTarget
        ? latestDroppable?.data.current
        : undefined;
    const dropRect = hasAcceptedDropTarget ? event.over?.rect : hasLatestDropTarget ? latestRect : undefined;
    let dropPreview = hasAcceptedDropTarget || hasLatestDropTarget ? tabDropPreviewRef.current : null;

    // Preview changes are intentionally buffered to prevent boundary flicker.
    // A visible accepted target is the primary drop contract. The last raw
    // hit is only a fallback for quick releases before the preview settles.
    if (
      activeData?.type === "tab" &&
      dragOriginSpaceRef.current &&
      isXingLuoTabDragData(overData) &&
      (overData.type === "tab" || overData.type === "group") &&
      overData.spaceId === dragOriginSpaceRef.current.id
    ) {
      const targetGroup = dragOriginSpaceRef.current.groups.find((group) => group.id === overData.groupId);
      if (targetGroup) {
        let targetIndex = targetGroup.tabs.length;
        if (overData.type === "tab") {
          const overIndex = targetGroup.tabs.findIndex((tab) => tab.id === overData.tabId);
          if (overIndex >= 0 && dropRect) {
            if (activeData.groupId === targetGroup.id) {
              const sourceIndex = targetGroup.tabs.findIndex((tab) => tab.id === activeData.tabId);
              targetIndex = getSameGroupDropIndex(sourceIndex, overIndex);
            } else {
              const pointer = xingLuoTabCollisionController.getLatestPointer();
              targetIndex = pointer
                ? getTabInsertionIndexFromPointer(overIndex, pointer, dropRect, collectionView === "list" ? "vertical" : "horizontal")
                : getTabInsertionIndex(overIndex, event.active.rect.current.translated, dropRect);
            }
          }
        }
        dropPreview = { tabId: activeData.tabId, targetGroupId: targetGroup.id, targetIndex };
      }
    }
    activeDragRef.current = null;
    tabDropPreviewRef.current = null;
    clearDndScrollSuspension();
    xingLuoTabCollisionController.reset();
    stopDndEdgeAutoScroll();
    dndPointerRef.current = null;
    setActiveDrag(null);
    cancelScheduledTabDropPreviewVisual();
    clearTabDropPreviewVisual();

    if (!activeData) {
      restoreDragOrigin();
      flushDeferredSpaceRefresh();
      return;
    }

    try {
      if (activeData.type === "tab" && dropPreview && dragOriginSpaceRef.current) {
        const nextSpace = moveTab(
          dragOriginSpaceRef.current,
          activeData.tabId,
          dropPreview.targetGroupId,
          dropPreview.targetIndex
        );
        if (nextSpace !== dragOriginSpaceRef.current) {
          await commitDraggedSpace(nextSpace, t("space.moved"));
        }
        return;
      }

      if (!isXingLuoTabDragData(overData)) {
        restoreDragOrigin();
        return;
      }

      if (activeData.type === "space" && overData.type === "space") {
        if (activeData.spaceId === overData.spaceId) return;
        const nextList = await reorderSpace(activeData.spaceId, overData.spaceId);
        setState((current) => ({ ...current, list: nextList, action: t("space.reordered") }));
        return;
      }

      if (activeData.type === "group") {
        if (overData.type === "space" && overData.spaceId !== activeData.spaceId) {
          const group = state.space?.groups.find((item) => item.id === activeData.groupId);
          if (group) await handleMoveGroupToSpaceId(group, overData.spaceId);
          return;
        }
        if (overData.type === "group" && state.space && overData.spaceId === state.space.id) {
          const nextSpace = moveGroup(state.space, activeData.groupId, overData.groupId);
          if (nextSpace !== state.space) await commitDraggedSpace(nextSpace, t("space.moved"));
        }
        return;
      }

      if (activeData.type === "tab") {
        if (overData.type === "space" && overData.spaceId !== activeData.spaceId) {
          restoreDragOrigin();
          await openTabMoveDialog(activeData.tabId, overData.spaceId);
          return;
        }
        restoreDragOrigin();
        return;
      }

      if (activeData.type === "session-tab") {
        if (overData.type === "group" || overData.type === "tab") {
          const targetIndex =
            overData.type === "tab"
              ? state.space?.groups
                  .find((group) => group.id === overData.groupId)
                  ?.tabs.findIndex((tab) => tab.id === overData.tabId)
              : undefined;
          await handleMoveSessionTabToGroup(overData.groupId, activeData.tabId, targetIndex);
          return;
        }
        if (overData.type === "space") {
          await handleMoveSessionTabToSpace(activeData.tabId, overData.spaceId);
        }
      }
    } catch {
      restoreDragOrigin();
      setState((current) => ({ ...current, action: t("common.operationFailed") }));
    } finally {
      dragOriginSpaceRef.current = null;
      flushDeferredSpaceRefresh();
    }
  }

  function handleDndDragCancel(_event: DragCancelEvent) {
    activeDragRef.current = null;
    tabDropPreviewRef.current = null;
    clearDndScrollSuspension();
    xingLuoTabCollisionController.reset();
    stopDndEdgeAutoScroll();
    dndPointerRef.current = null;
    setActiveDrag(null);
    cancelScheduledTabDropPreviewVisual();
    clearTabDropPreviewVisual();
    restoreDragOrigin();
    flushDeferredSpaceRefresh();
  }

  function clearDndScrollSuspension() {
    if (dndScrollSettleTimerRef.current != null) {
      window.clearTimeout(dndScrollSettleTimerRef.current);
      dndScrollSettleTimerRef.current = null;
    }
    xingLuoTabCollisionController.setSuspended(false);
  }

  function flushDeferredSpaceRefresh() {
    if (!deferredSpaceRefreshRef.current) return;
    deferredSpaceRefreshRef.current = false;
    void load();
  }

  function restoreDragOrigin() {
    const origin = dragOriginSpaceRef.current;
    if (origin) {
      setState((current) => ({ ...current, space: origin }));
    }
  }

  function clearTabDropPreviewVisual() {
    const element = tabDropPreviewElementRef.current;
    if (!element) return;

    if (element.matches("[data-tab-drop-indicator]")) {
      element.hidden = true;
      delete element.dataset.dropPosition;
    } else {
      delete element.dataset.tabDropPreview;
    }
    tabDropPreviewElementRef.current = null;
  }

  function cancelScheduledTabDropPreviewVisual() {
    pendingTabDropPreviewVisualRef.current = null;
    if (tabDropPreviewFrameRef.current == null) return;
    window.cancelAnimationFrame(tabDropPreviewFrameRef.current);
    tabDropPreviewFrameRef.current = null;
  }

  function scheduleTabDropPreviewVisual(preview: TabDropPreview) {
    pendingTabDropPreviewVisualRef.current = preview;
    if (tabDropPreviewFrameRef.current != null) return;

    tabDropPreviewFrameRef.current = window.requestAnimationFrame(() => {
      tabDropPreviewFrameRef.current = null;
      const pendingPreview = pendingTabDropPreviewVisualRef.current;
      pendingTabDropPreviewVisualRef.current = null;
      if (pendingPreview) showTabDropPreviewVisual(pendingPreview);
      else clearTabDropPreviewVisual();
    });
  }

  function showTabDropPreviewVisual(preview: Exclude<TabDropPreview, null>) {
    clearTabDropPreviewVisual();
    const group = document.querySelector<HTMLElement>(
      `[data-group-id="${globalThis.CSS.escape(preview.targetGroupId)}"]`
    );
    if (!group) return;

    const targetLength = dragOriginSpaceRef.current?.groups.find((item) => item.id === preview.targetGroupId)?.tabs.length ?? 0;
    if (targetLength === 0) {
      const placeholder = group.querySelector<HTMLElement>('[data-empty-group="true"]');
      if (!placeholder) return;
      placeholder.dataset.tabDropPreview = "true";
      tabDropPreviewElementRef.current = placeholder;
      return;
    }

    const atEnd = preview.targetIndex >= targetLength;
    const targetIndex = atEnd ? Math.max(0, targetLength - 1) : Math.max(0, preview.targetIndex);
    const card = group.querySelector<HTMLElement>(`[data-tab-index="${targetIndex}"]`);
    const indicator = card?.querySelector<HTMLElement>("[data-tab-drop-indicator]");
    if (!indicator) return;
    indicator.dataset.dropPosition = atEnd ? "after" : "before";
    indicator.hidden = false;
    tabDropPreviewElementRef.current = indicator;
  }

  async function handleMoveSessionTabToSpace(sessionTabId: string, targetSpaceId: string) {
    const tab = sessionTabs.find((item) => item.id === sessionTabId);
    if (!tab) return;
    if (targetSpaceId === state.space?.id) {
      await saveSessionTabsAsGroup([tab]);
      return;
    }

    const targetSpace = await getSpace(targetSpaceId);
    if (!targetSpace) return;
    const setting = await getUserSetting();
    const includePinned = setting.showPinnedSessionTab === "always";
    const result = appendSessionTabsAsGroup(targetSpace, [tab], {
      keepPinnedBrowserTabs: includePinned
    });
    await saveSpace(result.space);
    await removeBrowserTabs(result.removableBrowserTabIds);
    await loadSessionTabs();
    setState((current) => ({
      ...current,
      action: t("common.saved")
    }));
  }

  async function handleToggleSessionBarCollapsed() {
    const nextCollapsed = !isSessionBarCollapsed;
    await setSessionBarCollapsed(nextCollapsed);
  }

  async function handleToggleSessionTabSort() {
    const setting = await getUserSetting();
    const nextSort = sessionTabSort === "asc" ? "desc" : "asc";
    await saveUserSetting({
      ...setting,
      sessionTabSort: nextSort
    });
    setSessionTabSort(nextSort);
  }

  async function handleToggleGroupCollapsed(groupId: string) {
    const previousCollapsedGroupIds = collapsedGroupIdsRef.current;
    const nextCollapsedGroupIds = previousCollapsedGroupIds.includes(groupId)
      ? previousCollapsedGroupIds.filter((id) => id !== groupId)
      : [...previousCollapsedGroupIds, groupId];

    beginGroupLayoutAnimation();
    collapsedGroupIdsRef.current = nextCollapsedGroupIds;
    setCollapsedGroupIds(nextCollapsedGroupIds);

    try {
      await persistCollapsedGroups(nextCollapsedGroupIds);
    } catch {
      if (collapsedGroupIdsRef.current === nextCollapsedGroupIds) {
        beginGroupLayoutAnimation();
        collapsedGroupIdsRef.current = previousCollapsedGroupIds;
        setCollapsedGroupIds(previousCollapsedGroupIds);
      }
      setState((current) => ({ ...current, action: t("common.operationFailed") }));
    }
  }

  async function handleSetAllGroupsCollapsed(collapsed: boolean) {
    if (!state.space) return;
    const previousCollapsedGroupIds = collapsedGroupIdsRef.current;
    const currentGroupIds = new Set(state.space.groups.map((group) => group.id));
    const untouched = previousCollapsedGroupIds.filter((groupId) => !currentGroupIds.has(groupId));
    const nextCollapsedGroupIds = collapsed
      ? [...untouched, ...state.space.groups.map((group) => group.id)]
      : untouched;

    beginGroupLayoutAnimation();
    collapsedGroupIdsRef.current = nextCollapsedGroupIds;
    setCollapsedGroupIds(nextCollapsedGroupIds);

    try {
      await persistCollapsedGroups(nextCollapsedGroupIds);
    } catch {
      if (collapsedGroupIdsRef.current === nextCollapsedGroupIds) {
        beginGroupLayoutAnimation();
        collapsedGroupIdsRef.current = previousCollapsedGroupIds;
        setCollapsedGroupIds(previousCollapsedGroupIds);
      }
      setState((current) => ({ ...current, action: t("common.operationFailed") }));
    }
  }

  async function persistCollapsedGroups(nextCollapsedGroupIds: string[]) {
    const task = collapsedGroupsPersistenceRef.current
      .catch(() => undefined)
      .then(async () => {
        const setting = await getUserSetting();
        await saveUserSetting({ ...setting, collapsedGroups: nextCollapsedGroupIds });
      });
    collapsedGroupsPersistenceRef.current = task;
    await task;
  }

  function beginGroupLayoutAnimation() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setGroupLayoutAnimating(true);
    if (groupLayoutAnimationTimerRef.current != null) {
      window.clearTimeout(groupLayoutAnimationTimerRef.current);
    }
    groupLayoutAnimationTimerRef.current = window.setTimeout(() => {
      groupLayoutAnimationTimerRef.current = null;
      setGroupLayoutAnimating(false);
    }, 240);
  }

  async function handleSetCollectionView(view: CollectionView) {
    const setting = await getUserSetting();
    await saveUserSetting({ ...setting, collectionView: view });
    setCollectionView(view);
  }

  async function handleSetCollectionSort(sort: CollectionSort) {
    const setting = await getUserSetting();
    await saveUserSetting({ ...setting, collectionSort: sort });
    setCollectionSort(sort);
  }

  async function handleSetZenMode(enabled: boolean) {
    setZenMode(enabled);
    setActiveTag(null);
    await updateUserSetting({ zenMode: enabled }).catch(() => {
      setZenMode(userSetting.zenMode ?? false);
    });
  }

  async function handleSetZenTheme(theme: ZenTheme) {
    setZenTheme(theme);
    await updateUserSetting({ zenTheme: theme }).catch(() => {
      setZenTheme(userSetting.zenTheme ?? "minimal");
    });
  }

  async function handleSubmitGroupTags(event: FormEvent) {
    event.preventDefault();
    if (!state.space || !groupTagsDialog) return;
    const nextSpace = setGroupTags(state.space, groupTagsDialog.group.id, groupTagsDialog.tags.split(","));
    try {
      await saveSpace(nextSpace);
      setState((current) => ({ ...current, space: nextSpace, action: t("space.tagsUpdated") }));
      setGroupTagsDialog(null);
    } catch {
      setState((current) => ({ ...current, action: t("common.operationFailed") }));
    }
  }

  async function handleConfirmDialogAction() {
    const action = confirmDialog?.onConfirm;
    setConfirmDialog(null);
    await action?.();
  }

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadSessionTabs();
    void loadPageSettings();
    return watchCurrentWindowTabs({
      onRefresh: () => void loadSessionTabs(),
      onRemoved: (tabId) => {
        setSessionTabs((current) => current.filter((tab) => tab.tid !== tabId.toString()));
      },
      onUpdated: (tabId, _changeInfo, tab) => {
        updateSessionTabFromBrowser(tabId, tab);
      }
    });
  }, [loadPageSettings, loadSessionTabs, updateSessionTabFromBrowser]);

  useEffect(() => {
    if (!state.action) return;
    const action = state.action;
    const timeout = window.setTimeout(() => {
      setState((current) => (current.action === action ? { ...current, action: null } : current));
    }, 2500);
    return () => window.clearTimeout(timeout);
  }, [state.action]);

  useEffect(() => {
    if (!isZenMode) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      void handleSetZenMode(false);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [isZenMode]);

  useEffect(() => {
    const scroller = groupScrollRef.current;
    if (!scroller) return;
    const metrics = VIEW_METRICS[collectionView];
    const update = () => {
      if (collectionView === "list") {
        setEstimatedGroupColumns(1);
        return;
      }
      const style = getComputedStyle(scroller);
      const horizontalPadding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight) + 32;
      const availableWidth = Math.max(metrics.minWidth, scroller.clientWidth - horizontalPadding);
      const columns = Math.max(1, Math.floor((availableWidth + metrics.gap) / (metrics.minWidth + metrics.gap)));
      setEstimatedGroupColumns((current) => current === columns ? current : columns);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [collectionView, isZenMode]);

  const index = useMemo(() => {
    if (!state.space) return [];
    return buildSearchIndex(state.list, { [state.space.id]: state.space });
  }, [state.list, state.space]);

  const results = useMemo(() => searchTabs(index, query), [index, query]);
  const allGroups = useMemo(
    () => (state.space ? sortGroupsForMode(state.space, collectionSort) : []),
    [collectionSort, state.space]
  );
  const spaceStats = useMemo(() => ({
    groups: state.space?.groups.length ?? 0,
    tabs: state.space?.groups.reduce((total, group) => total + group.tabs.length, 0) ?? 0
  }), [state.space]);
  const availableTags = useMemo(
    () => Array.from(new Set(allGroups.flatMap((group) => group.tags ?? []))).sort((a, b) => a.localeCompare(b)),
    [allGroups]
  );
  useEffect(() => {
    if (activeTag && activeTag !== NO_TAG_FILTER && !availableTags.some((tag) => tag.toLocaleLowerCase() === activeTag.toLocaleLowerCase())) {
      setActiveTag(null);
    }
  }, [activeTag, availableTags]);
  const visibleGroups = useMemo(
    () => activeTag
      ? allGroups.filter((group) => activeTag === NO_TAG_FILTER
        ? (group.tags?.length ?? 0) === 0
        : group.tags?.some((tag) => tag.toLocaleLowerCase() === activeTag.toLocaleLowerCase()))
      : allGroups,
    [activeTag, allGroups]
  );
  const collapsedGroupIdSet = useMemo(() => new Set(collapsedGroupIds), [collapsedGroupIds]);
  const groupMoveTargets = useMemo(
    () => state.list.filter((space) => space.id !== state.space?.id),
    [state.list, state.space?.id]
  );
  const activeSpaceSummary = state.space
    ? state.list.find((space) => space.id === state.space?.id) ?? { id: state.space.id, name: state.space.name }
    : null;

  return (
    <DndContext
      sensors={sensors}
      autoScroll={false}
      collisionDetection={xingLuoTabCollisionDetection}
      onDragStart={handleDndDragStart}
      onDragOver={handleDndDragOver}
      onDragEnd={(event) => void handleDndDragEnd(event)}
      onDragCancel={handleDndDragCancel}
    >
      <div
        data-zen-mode={isZenMode || undefined}
        data-zen-theme={isZenMode ? zenTheme : undefined}
        className={[
          "relative flex h-full min-w-0",
          isZenMode ? `zen-surface ${ZEN_THEME_CLASSES[zenTheme]} min-h-screen w-full` : ""
        ].join(" ")}
      >
      <section
        data-space-main="true"
        data-space-loading={state.loading}
        className="relative flex min-w-0 flex-1 flex-col"
      >
        {isZenMode ? (
          <div className="group/zen-exit fixed right-0 top-0 z-40 flex h-24 w-32 items-start justify-end p-4">
            <div
              data-zen-controls="true"
              className="flex translate-y-1 items-center gap-1 rounded-full border bg-background/80 p-1 opacity-0 shadow-lg backdrop-blur-md transition-all group-hover/zen-exit:translate-y-0 group-hover/zen-exit:opacity-100 focus-within:translate-y-0 focus-within:opacity-100"
            >
              {ZEN_THEMES.map((theme) => (
                <button
                  key={theme}
                  type="button"
                  data-zen-theme-option={theme}
                  title={t(`space.zenTheme.${theme}` as "space.zenTheme.minimal")}
                  className={[
                    "h-6 w-6 rounded-full border text-[10px] font-semibold uppercase",
                    zenTheme === theme ? "border-primary bg-primary text-primary-foreground" : "bg-background/70"
                  ].join(" ")}
                  onClick={() => void handleSetZenTheme(theme)}
                >
                  {theme.slice(0, 1)}
                </button>
              ))}
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" title={t("space.exitZen")} onClick={() => void handleSetZenMode(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
        {state.action ? (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute right-4 top-16 z-30 max-w-sm rounded-md bg-background shadow-lg"
          >
            <StatusLine text={state.action} />
          </div>
        ) : null}
        {isZenMode ? (
          <div className="zen-space-title shrink-0 px-6 pb-3 pt-8 text-center text-2xl font-semibold">
            {state.space?.name ?? t("space.label")}
          </div>
        ) : <header className="sticky top-0 z-10 flex h-14 flex-row items-center justify-between border-b bg-background/80 px-4 backdrop-blur-md">
          <button
            data-action="rename-space"
            className="min-w-0 truncate rounded px-1 text-left text-lg font-semibold hover:bg-accent hover:text-accent-foreground"
            disabled={!activeSpaceSummary}
            onClick={() => activeSpaceSummary && void handleRenameSpace(activeSpaceSummary)}
            title={t("space.rename")}
          >
            {state.space?.name ?? t("space.label")}
          </button>
          <div className="flex shrink-0 flex-row items-center gap-4">
            <Button
              variant="outline"
              className="text-muted-foreground"
              onClick={() => window.dispatchEvent(new Event("xingluotab:open-search"))}
            >
              <span>{t("sidebar.searchTabs")}</span>
              <kbd className="ml-2 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                <span className="text-xs">⌘</span>J
              </kbd>
            </Button>
            <Button
              variant="outline"
              data-action="enter-zen"
              disabled={!state.space || state.loading}
              onClick={() => void handleSetZenMode(true)}
            >
              <Leaf className="h-4 w-4" />
              {t("space.zen")}
            </Button>
            <Button
              variant="outline"
              disabled={!state.space || state.loading}
              onClick={() => void handleCreateGroup()}
            >
              <Plus className="h-4 w-4" />
              {t("space.addCollection")}
            </Button>
          </div>
        </header>}

        {isZenMode ? null : (
          <div data-space-tools="true" className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b bg-background px-4 py-1.5 text-xs">
            <Select value={collectionSort} onValueChange={(value) => void handleSetCollectionSort(value as CollectionSort)}>
              <SelectTrigger data-action="collection-sort" className="h-8 w-44 text-xs" title={collectionSort === "manual" ? t("space.dragDropDescription") : t("space.sort.dragDisabled")}>
                <GripVertical className="h-3.5 w-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLLECTION_SORTS.map((sort) => (
                  <SelectItem key={sort} value={sort}>{t(`space.sort.${sort}` as "space.sort.manual")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={activeTag ?? "__all__"} onValueChange={(value) => setActiveTag(value === "__all__" ? null : value)}>
              <SelectTrigger data-action="tag-filter" className="h-8 w-40 text-xs" disabled={allGroups.length === 0}>
                <Tag className="h-3.5 w-3.5" />
                <SelectValue placeholder={t("space.tagFilter")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("space.allTags")}</SelectItem>
                <SelectItem value={NO_TAG_FILTER}>{t("space.noTags")}</SelectItem>
                {availableTags.map((tag) => <SelectItem key={tag} value={tag}>{tag}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={collectionView} onValueChange={(value) => void handleSetCollectionView(value as CollectionView)}>
              <SelectTrigger data-action="collection-view" className="h-8 w-36 text-xs">
                <LayoutGrid className="h-3.5 w-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLLECTION_VIEWS.map((view) => (
                  <SelectItem key={view} value={view}>{t(`space.view.${view}` as "space.view.card")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="ghost" size="sm" data-action="expand-all" className="h-8 text-xs" onClick={() => void handleSetAllGroupsCollapsed(false)}>
              <Maximize2 className="h-3.5 w-3.5" />
              {t("space.expandAll")}
            </Button>
            <Button type="button" variant="ghost" size="sm" data-action="collapse-all" className="h-8 text-xs" onClick={() => void handleSetAllGroupsCollapsed(true)}>
              <Minimize2 className="h-3.5 w-3.5" />
              {t("space.collapseAll")}
            </Button>
            <div
              data-space-stats="true"
              className="ml-auto shrink-0 rounded-md bg-muted/55 px-2.5 py-1.5 font-medium tabular-nums text-muted-foreground"
              title={t("space.collectionStats", spaceStats)}
            >
              {t("space.collectionStats", spaceStats)}
            </div>
          </div>
        )}

        <div ref={groupScrollRef} onScroll={handleGroupContentScroll} onWheel={handleGroupContentWheel} data-space-content-scroll="true" className={["min-h-0 flex-1 overflow-auto [contain:layout_paint_style]", isZenMode ? "zen-content px-[clamp(1rem,6vw,6rem)] pb-12" : ""].join(" ")}>
          {state.loading ? (
            <div className="p-4">
              <StatusLine text={t("space.loadingData")} />
            </div>
          ) : null}
          {state.error ? (
            <div className="p-4">
              <StatusLine text={state.error} tone="error" />
            </div>
          ) : null}
          {!state.loading && !state.error && !state.space ? (
            <div className="p-4">
              <StatusLine text={t("space.notFound")} />
            </div>
          ) : null}
          {!state.loading && !state.error && state.space && query ? (
            <div className="p-4">
              <SearchResults rows={results} t={t} onOpen={(row, event) => void handleOpenSearchResult(row, event)} />
            </div>
          ) : null}
          {!state.loading && !state.error && state.space && !query ? (
            visibleGroups.length > 0 ? (
              <SortableContext
                items={visibleGroups.map((group) => dndId.group(state.space!.id, group.id))}
                strategy={verticalListSortingStrategy}
              >
                <VirtualizedGroupWindow
                  scrollElementRef={groupScrollRef}
                  count={visibleGroups.length}
                  getItemKey={(index) => visibleGroups[index]?.id ?? index}
                  estimateSize={(index) => {
                    const group = visibleGroups[index];
                    if (!group || (!isZenMode && collapsedGroupIdSet.has(group.id))) return GROUP_CHROME_HEIGHT;
                    const metrics = VIEW_METRICS[collectionView];
                    if (group.tabs.length === 0) return GROUP_CHROME_HEIGHT + 60;
                    const rowCount = Math.ceil(group.tabs.length / estimatedGroupColumns);
                    return GROUP_CHROME_HEIGHT + rowCount * metrics.rowHeight - metrics.gap;
                  }}
                  animateLayout={isGroupLayoutAnimating}
                  isDragActive={Boolean(activeDrag)}
                  activeGroupId={activeDrag && (activeDrag.type === "tab" || activeDrag.type === "group") ? activeDrag.groupId : null}
                  prepareContent={(previewItems, signal) => {
                    const faviconItems = previewItems.flatMap(({ index, scrollOffset, viewportHeight }) => {
                      const group = visibleGroups[index];
                      if (!group) return [];
                      return getStaticPreviewTabWindow(
                        group,
                        collectionView,
                        estimatedGroupColumns,
                        scrollOffset,
                        viewportHeight
                      ).tabs.map((tab) => ({ src: tab.favIconUrl, url: tab.url }));
                    });
                    return preloadFavicons(faviconItems, { concurrency: 4, timeoutMs: 180, signal });
                  }}
                  renderPreview={(groupIndex, scrollOffset, viewportHeight, buffered, showWarmFavicons) => {
                    const group = visibleGroups[groupIndex];
                    if (!group) return null;
                    return (
                      <StaticGroupPreview
                        group={group}
                        spaceId={state.space!.id}
                        view={collectionView}
                        collapsed={!isZenMode && collapsedGroupIdSet.has(group.id)}
                        pinned={state.space?.pins[group.id] != null}
                        zenMode={isZenMode}
                        columns={estimatedGroupColumns}
                        scrollOffset={scrollOffset}
                        viewportHeight={viewportHeight}
                        activeDragType={buffered ? null : activeDrag?.type ?? null}
                        buffered={buffered}
                        showWarmFavicons={showWarmFavicons}
                        t={t}
                        onOpenTab={handleOpenTab}
                      />
                    );
                  }}
                >
                  {(groupIndex, virtualGroupStart) => {
                  const group = visibleGroups[groupIndex];
                  if (!group) return null;
                  const isPinned = state.space?.pins[group.id] != null;

                  return (
                    <SortableGroupSection
                      spaceId={state.space!.id}
                      groupId={group.id}
                      disabled={isPinned || isZenMode || collectionSort !== "manual"}
                      zenMode={isZenMode}
                    >
                      {(sortable) => (
                        <>
                      <header className="group/header mb-2 flex items-center justify-between">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          {isPinned ? (
                            <Pin className="h-4 w-4 shrink-0 text-blue-500" />
                          ) : isZenMode ? null : (
                            <button
                              data-group-drag-handle="true"
                              {...sortable.attributes}
                              {...sortable.listeners}
                              disabled={collectionSort !== "manual"}
                              className={collectionSort === "manual"
                                ? "cursor-grab touch-none text-gray-400 active:cursor-grabbing"
                                : "cursor-not-allowed text-gray-300 dark:text-zinc-600"}
                              title={collectionSort === "manual" ? t("space.reorderGroup") : t("space.sort.dragDisabled")}
                            >
                              <GripVertical className="h-4 w-4 text-gray-400" />
                            </button>
                          )}
                          {isZenMode ? (
                            <h2 className="min-w-0 truncate text-left text-sm font-semibold">{group.name}</h2>
                          ) : <button
                              data-action="rename-group"
                              className="min-w-0 truncate text-left text-sm font-medium"
                              onClick={() => void handleRenameGroup(group)}
                              title={t("space.renameGroup")}
                            >
                              {group.name}
                            </button>}
                          {isZenMode ? null : (
                            <button
                              type="button"
                              data-action="edit-group-tags-inline"
                              className="flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                              title={t("space.editTags")}
                              onClick={() => setGroupTagsDialog({ group, tags: (group.tags ?? []).join(", ") })}
                            >
                              <Tag className="h-3.5 w-3.5" />
                              <span>{(group.tags?.length ?? 0) > 0 ? t("space.editTags") : t("space.addTags")}</span>
                            </button>
                          )}
                          {(group.tags ?? []).map((tag) => (
                            <span key={tag} data-group-tag={tag} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                              {tag}
                            </span>
                          ))}
                          {isZenMode ? null : <button
                            className="flex h-8 min-w-8 flex-1 flex-row items-center text-muted-foreground"
                            title={collapsedGroupIdSet.has(group.id) ? t("space.expandGroup") : t("space.collapseGroup")}
                            onClick={() => void handleToggleGroupCollapsed(group.id)}
                          >
                            <ChevronDown
                              className={[
                                "h-4 w-4 transition-transform duration-300 ease-out",
                                collapsedGroupIdSet.has(group.id) ? "-rotate-90" : "rotate-0"
                              ].join(" ")}
                            />
                          </button>}
                        </div>
                        {isZenMode ? null : <div className="flex shrink-0 flex-row items-center gap-2 opacity-0 transition-opacity duration-200 group-focus-within/header:opacity-100 group-hover/header:opacity-100">
                          <Button size="icon" variant="ghost" title={t("space.openGroup")} onClick={(event) => void handleOpenGroup(group, event)}>
                            <FolderOpen className="h-4 w-4 text-gray-500" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            data-action="delete-group"
                            title={t("space.deleteGroup")}
                            onClick={() => void handleDeleteGroup(group)}
                          >
                            <Trash2 className="h-4 w-4 text-gray-500" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" title={t("space.groupActions")} data-no-dnd="true">
                                <MoreHorizontal className="h-4 w-4 text-gray-500" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                data-action="edit-group-tags"
                                onSelect={() => setGroupTagsDialog({ group, tags: (group.tags ?? []).join(", ") })}
                              >
                                <Tag className="h-4 w-4" />
                                <span>{t("space.editTags")}</span>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem data-action="toggle-pin-group" onSelect={() => void handleTogglePin(group)}>
                                {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                                <span>{isPinned ? t("common.unpin") : t("common.pin")}</span>
                              </DropdownMenuItem>
                              {groupMoveTargets.length > 0 ? (
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger>
                                    <MoveRight className="h-4 w-4" />
                                    <span>{t("common.moveTo")}</span>
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent>
                                    {groupMoveTargets.map((space) => (
                                      <DropdownMenuItem
                                        key={space.id}
                                        data-action="move-group-to-space"
                                        onSelect={() => void handleMoveGroupToSpaceId(group, space.id)}
                                      >
                                        <SpaceIcon name={space.icon} className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        <span>{space.name}</span>
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                              ) : (
                                <DropdownMenuItem disabled>
                                  <MoveRight className="h-4 w-4" />
                                  <span>{t("common.moveTo")}</span>
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>}
                      </header>
                      <GroupCollapseContent collapsed={!isZenMode && collapsedGroupIdSet.has(group.id)}>
                        <SortableContext
                          items={group.tabs.map((tab) => dndId.tab(state.space!.id, group.id, tab.id))}
                          strategy={STATIC_TAB_SORTING_STRATEGY}
                        >
                          {group.tabs.length === 0 ? (
                            <div className="flex min-h-[60px] items-center justify-center rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
                              <div
                                data-empty-group="true"
                                className="empty-placeholder pointer-events-none w-full rounded-md border-2 border-dashed border-gray-200 py-4 text-center transition-colors data-[tab-drop-preview=true]:border-blue-400 data-[tab-drop-preview=true]:bg-blue-50/70 dark:border-gray-700 dark:data-[tab-drop-preview=true]:border-blue-500 dark:data-[tab-drop-preview=true]:bg-blue-950/30"
                              >
                                <p className="text-gray-400">{t("space.emptyGroup")}</p>
                              </div>
                            </div>
                          ) : group.tabs.length >= CARD_GRID_VIRTUALIZATION_THRESHOLD ? (
                            <VirtualizedTabGrid
                              scrollElementRef={groupScrollRef}
                              virtualGroupStart={virtualGroupStart}
                              initialColumns={estimatedGroupColumns}
                              spaceId={state.space!.id}
                              group={group}
                              view={collectionView}
                              disabled={isZenMode || collapsedGroupIdSet.has(group.id)}
                              t={t}
                              onOpenTab={handleOpenTab}
                              onEditTab={handleEditTabTitle}
                              onMoveTab={(tab) => void openTabMoveDialog(tab.id)}
                              onDeleteTab={handleDeleteTab}
                            />
                          ) : (
                            <div className={getTabGridClassName(collectionView)}>
                              {group.tabs.map((tab, tabIndex) => (
                                <TabCard
                                  key={tab.id}
                                  spaceId={state.space!.id}
                                  groupId={group.id}
                                  tab={tab}
                                  tabIndex={tabIndex}
                                  view={collectionView}
                                  disabled={isZenMode || collapsedGroupIdSet.has(group.id)}
                                  t={t}
                                  onOpen={(event) => void handleOpenTab(tab, event)}
                                  onEdit={() => void handleEditTabTitle(tab)}
                                  onMove={() => void openTabMoveDialog(tab.id)}
                                  onDelete={() => void handleDeleteTab(tab)}
                                />
                              ))}
                            </div>
                          )}
                        </SortableContext>
                      </GroupCollapseContent>
                        </>
                      )}
                    </SortableGroupSection>
                  );
                  }}
                </VirtualizedGroupWindow>
              </SortableContext>
            ) : (
              <StatusLine text={activeTag ? t("search.noMatches") : t("space.ready")} />
            )
          ) : null}
        </div>
      </section>
      {isZenMode ? null : <SessionBar
        isCollapsed={isSessionBarCollapsed}
        tabs={sessionTabs}
        sortDirection={sessionTabSort}
        onToggleCollapsed={() => void handleToggleSessionBarCollapsed()}
        onToggleSort={() => void handleToggleSessionTabSort()}
        onSaveAll={() => void handleSaveCurrentWindow()}
        onActivateTab={(tab) => void handleActivateSessionTab(tab)}
        onCloseTab={(tab) => void handleCloseSessionTab(tab)}
      />}

      <Dialog open={spaceNameDialog != null} onOpenChange={(open) => !open && setSpaceNameDialog(null)}>
        <DialogContent closeLabel={t("common.close")}>
          <DialogHeader>
            <DialogTitle>{t("space.rename")}</DialogTitle>
            <DialogDescription>{t("space.enterName")}</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={(event) => void handleSubmitSpaceNameDialog(event)}>
            <label className="grid gap-2 text-sm font-medium">
              {t("space.enterName")}
              <Input
                autoFocus
                value={spaceNameDialog?.name ?? ""}
                onChange={(event) => {
                  const name = event.currentTarget.value;
                  setSpaceNameDialog((current) => (current ? { ...current, name } : current));
                }}
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSpaceNameDialog(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit">{t("common.save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={groupNameDialog != null} onOpenChange={(open) => !open && setGroupNameDialog(null)}>
        <DialogContent closeLabel={t("common.close")}>
          <DialogHeader>
            <DialogTitle>{t("space.renameGroup")}</DialogTitle>
            <DialogDescription>{t("space.enterGroupName")}</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={(event) => void handleSubmitGroupNameDialog(event)}>
            <label className="grid gap-2 text-sm font-medium">
              {t("space.groupName")}
              <Input
                autoFocus
                value={groupNameDialog?.name ?? ""}
                onChange={(event) => {
                  const name = event.currentTarget.value;
                  setGroupNameDialog((current) => (current ? { ...current, name } : current));
                }}
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setGroupNameDialog(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit">{t("common.save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={groupTagsDialog != null} onOpenChange={(open) => !open && setGroupTagsDialog(null)}>
        <DialogContent closeLabel={t("common.close")}>
          <DialogHeader>
            <DialogTitle>{t("space.editTags")}</DialogTitle>
            <DialogDescription>{t("space.tagsDescription")}</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={(event) => void handleSubmitGroupTags(event)}>
            <label className="grid gap-2 text-sm font-medium">
              {t("space.tags")}
              <Input
                autoFocus
                value={groupTagsDialog?.tags ?? ""}
                placeholder={t("space.tagsPlaceholder")}
                onChange={(event) => {
                  const tags = event.currentTarget.value;
                  setGroupTagsDialog((current) => current ? { ...current, tags } : current);
                }}
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setGroupTagsDialog(null)}>{t("common.cancel")}</Button>
              <Button type="submit">{t("common.save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={tabEditDialog != null} onOpenChange={(open) => !open && setTabEditDialog(null)}>
        <DialogContent closeLabel={t("common.close")}>
          <DialogHeader>
            <DialogTitle>{t("space.editTabTitle")}</DialogTitle>
            <DialogDescription>{t("space.editTabDescription")}</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={(event) => void handleSubmitTabEditDialog(event)}>
            <label className="grid gap-2 text-sm font-medium">
              {t("space.tabTitle")}
              <Input
                autoFocus
                value={tabEditDialog?.title ?? ""}
                onChange={(event) => {
                  const title = event.currentTarget.value;
                  setTabEditDialog((current) => (current ? { ...current, title } : current));
                }}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              {t("space.tabUrl")}
              <Input
                value={tabEditDialog?.url ?? ""}
                onChange={(event) => {
                  const url = event.currentTarget.value;
                  setTabEditDialog((current) => (current ? { ...current, url } : current));
                }}
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTabEditDialog(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit">{t("common.save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={tabMoveDialog != null} onOpenChange={(open) => !open && setTabMoveDialog(null)}>
        <DialogContent closeLabel={t("common.close")}>
          <DialogHeader>
            <DialogTitle>{t("common.moveTo")}</DialogTitle>
            <DialogDescription>{t("space.moveTabDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-medium">
              {t("space.label")}
              <Select
                value={tabMoveDialog?.targetSpaceId ?? ""}
                onValueChange={(value) => void handleChangeTabMoveSpace(value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {state.list
                    .map((space) => (
                      <SelectItem key={space.id} value={space.id}>
                        {space.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              {t("space.groupName")}
              <Select
                value={tabMoveDialog?.targetGroupId || undefined}
                disabled={tabMoveDialog?.loading || !tabMoveDialog?.targetSpace?.groups.length}
                onValueChange={(value) =>
                  setTabMoveDialog((current) => (current ? { ...current, targetGroupId: value } : current))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={tabMoveDialog?.loading ? t("common.loading") : t("space.noTargetGroup")} />
                </SelectTrigger>
                <SelectContent>
                  {(tabMoveDialog?.targetSpace ? sortGroupsForDisplay(tabMoveDialog.targetSpace) : [])
                    .filter((group) => tabMoveDialog?.targetSpaceId !== state.space?.id || group.id !== tabMoveDialog?.sourceGroupId)
                    .map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTabMoveDialog(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                disabled={tabMoveDialog?.loading || !tabMoveDialog?.targetGroupId}
                onClick={() => void handleConfirmTabMove()}
              >
                {t("common.moveTo")}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDialog != null} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog?.title ?? t("common.confirm")}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog?.description ?? ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmDialogAction()}>
              {confirmDialog?.confirmText ?? t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "ease-out" }}>
        <DndDragPreview data={activeDrag} space={state.space} spaces={state.list} sessionTabs={sessionTabs} />
      </DragOverlay>
    </DndContext>
  );
}

function GroupCollapseContent({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  const previousCollapsedRef = useRef(collapsed);
  const shouldAnimateExpansion = previousCollapsedRef.current && !collapsed;

  useEffect(() => {
    previousCollapsedRef.current = collapsed;
  }, [collapsed]);

  return (
    <div
      data-group-collapse-content="true"
      data-state={collapsed ? "closed" : "open"}
      aria-hidden={collapsed}
      className={collapsed
        ? "hidden"
        : shouldAnimateExpansion
          ? "animate-in fade-in slide-in-from-top-1 duration-150 motion-reduce:animate-none"
          : ""}
    >
      {collapsed ? null : children}
    </div>
  );
}

function VirtualizedGroupWindow({
  scrollElementRef,
  count,
  getItemKey,
  estimateSize,
  animateLayout,
  isDragActive,
  activeGroupId,
  prepareContent,
  renderPreview,
  children
}: {
  scrollElementRef: { current: HTMLDivElement | null };
  count: number;
  getItemKey: (index: number) => string | number;
  estimateSize: (index: number) => number;
  animateLayout: boolean;
  isDragActive: boolean;
  activeGroupId: string | null;
  prepareContent: (
    items: Array<{ index: number; scrollOffset: number; viewportHeight: number; visible: boolean }>,
    signal: AbortSignal
  ) => Promise<void>;
  renderPreview: (
    index: number,
    scrollOffset: number,
    viewportHeight: number,
    buffered: boolean,
    showWarmFavicons: boolean
  ) => ReactNode;
  children: (index: number, start: number) => ReactNode;
}) {
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollElementRef.current,
    getItemKey,
    estimateSize,
    overscan: 6,
    isScrollingResetDelay: 180,
    useFlushSync: false
  });
  const virtualItems = virtualizer.getVirtualItems();
  const windowStart = virtualItems[0]?.start ?? 0;
  const isScrolling = virtualizer.isScrolling;
  const virtualKeySignature = virtualItems.map((item) => String(item.key)).join("\u001f");
  const [interactiveGroupKeys, setInteractiveGroupKeys] = useState<Set<string>>(() => new Set());
  const [interactiveLayerRevealed, setInteractiveLayerRevealed] = useState(false);
  const prepareContentRef = useRef(prepareContent);
  prepareContentRef.current = prepareContent;

  useEffect(() => {
    if (isScrolling) {
      setInteractiveLayerRevealed(false);
      setInteractiveGroupKeys((current) => current.size === 0 ? current : new Set());
      return;
    }
    if (activeGroupId || virtualItems.length === 0) return;
    const currentKeys = virtualItems.map((item) => String(item.key));
    if (interactiveLayerRevealed && currentKeys.every((key) => interactiveGroupKeys.has(key))) return;
    setInteractiveLayerRevealed(false);
    let cancelled = false;
    const prepareController = new AbortController();
    let activationFrame: number | null = null;
    let revealFrame: number | null = null;
    const scroller = scrollElementRef.current;
    const scrollTop = scroller?.scrollTop ?? 0;
    const viewportHeight = scroller?.clientHeight ?? 900;
    const viewportBottom = scrollTop + viewportHeight;
    const viewportCenter = scrollTop + viewportHeight / 2;
    const prioritizedItems = [...virtualItems]
      .sort((left, right) => {
        const leftVisible = left.end > scrollTop && left.start < viewportBottom;
        const rightVisible = right.end > scrollTop && right.start < viewportBottom;
        if (leftVisible !== rightVisible) return leftVisible ? -1 : 1;
        const leftCenter = (left.start + left.end) / 2;
        const rightCenter = (right.start + right.end) / 2;
        return Math.abs(leftCenter - viewportCenter) - Math.abs(rightCenter - viewportCenter);
      });
    const activationKeys = prioritizedItems
      .map((item) => String(item.key))
      .filter((key) => !interactiveGroupKeys.has(key));
    const previewItems = prioritizedItems.map((item) => ({
      index: item.index,
      scrollOffset: Math.max(0, scrollTop - item.start),
      viewportHeight,
      visible: item.end > scrollTop && item.start < viewportBottom
    }));
    void prepareContentRef.current(previewItems, prepareController.signal).then(() => {
      if (cancelled) return;
      if (activationKeys.length === 0) {
        setInteractiveLayerRevealed(true);
        return;
      }
      let activationIndex = 0;
      const activateNextGroup = () => {
        if (cancelled) return;
        const key = activationKeys[activationIndex];
        activationIndex += 1;
        if (key) {
          setInteractiveGroupKeys((current) => {
            if (current.has(key)) return current;
            const next = new Set(current);
            next.add(key);
            return next;
          });
        }
        if (activationIndex < activationKeys.length) {
          activationFrame = window.requestAnimationFrame(activateNextGroup);
        } else {
          // Keep the frozen preview visible until React has committed every
          // interactive group, then reveal the prepared layer atomically.
          revealFrame = window.requestAnimationFrame(() => {
            revealFrame = window.requestAnimationFrame(() => {
              if (!cancelled) setInteractiveLayerRevealed(true);
            });
          });
        }
      };
      activationFrame = window.requestAnimationFrame(activateNextGroup);
    });
    return () => {
      cancelled = true;
      prepareController.abort();
      if (activationFrame != null) window.cancelAnimationFrame(activationFrame);
      if (revealFrame != null) window.cancelAnimationFrame(revealFrame);
    };
  }, [activeGroupId, isScrolling, scrollElementRef, virtualKeySignature]);

  return (
    <div className="relative min-w-0" style={{ height: `${virtualizer.getTotalSize()}px` }}>
      <DynamicDroppableMeasurement
        enabled={isDragActive}
        signature={`${isScrolling ? "scrolling" : "settled"}:${virtualKeySignature}`}
      />
      <div className="min-w-0 will-change-transform" style={{ transform: `translate3d(0, ${windowStart}px, 0)` }}>
        {virtualItems.map((virtualItem) => {
          const key = String(virtualItem.key);
          const isActiveGroup = key === activeGroupId;
          const scroller = scrollElementRef.current;
          const scrollTop = scroller?.scrollTop ?? 0;
          const viewportBottom = scrollTop + (scroller?.clientHeight ?? 900);
          const showWarmFavicons = virtualItem.end > scrollTop && virtualItem.start < viewportBottom;
          const interactiveReady = isActiveGroup || interactiveGroupKeys.has(key);
          const showPreviewOnly = !isActiveGroup && (isScrolling || !interactiveReady);
          const showBufferedPreview = !isActiveGroup && !isScrolling && interactiveReady && !interactiveLayerRevealed;
          return (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            data-group-virtual-row="true"
            ref={virtualizer.measureElement}
            style={showPreviewOnly ? { height: `${virtualItem.size}px` } : undefined}
            className={[
              "w-full",
              showBufferedPreview ? "relative" : "",
              animateLayout
                ? "transition-transform duration-200 ease-out motion-reduce:transition-none"
                : ""
            ].join(" ")}
          >
            {showPreviewOnly ? (
              renderPreview(
                virtualItem.index,
                Math.max(0, (scrollElementRef.current?.scrollTop ?? 0) - virtualItem.start),
                scrollElementRef.current?.clientHeight ?? 900,
                false,
                showWarmFavicons
              )
            ) : (
              <>
                {showBufferedPreview ? (
                  <div
                    aria-hidden="true"
                    data-group-buffer-overlay="true"
                    className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
                  >
                    {renderPreview(
                      virtualItem.index,
                      Math.max(0, (scrollElementRef.current?.scrollTop ?? 0) - virtualItem.start),
                      scrollElementRef.current?.clientHeight ?? 900,
                      true,
                      showWarmFavicons
                    )}
                  </div>
                ) : null}
                <div
                  aria-hidden={showBufferedPreview}
                  data-group-interactive-layer="true"
                  className={showBufferedPreview ? "invisible" : ""}
                >
                  <VirtualizedGroupContent render={children} index={virtualItem.index} start={virtualItem.start} />
                </div>
              </>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}

function DynamicDroppableMeasurement({ enabled, signature }: { enabled: boolean; signature: string }) {
  const { measureDroppableContainers } = useDndContext();

  useEffect(() => {
    if (!enabled) return;
    const frame = window.requestAnimationFrame(() => {
      const ids = Array.from(document.querySelectorAll<HTMLElement>("[data-static-droppable-id]"))
        .map((element) => element.dataset.staticDroppableId)
        .filter((id): id is string => Boolean(id));
      measureDroppableContainers(ids);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [enabled, measureDroppableContainers, signature]);

  return null;
}

const VirtualizedGroupContent = memo(function VirtualizedGroupContent({
  render,
  index,
  start
}: {
  render: (index: number, start: number) => ReactNode;
  index: number;
  start: number;
}) {
  return render(index, start);
});

function getStaticPreviewTabWindow(
  group: TabGroup,
  view: CollectionView,
  columns: number,
  scrollOffset: number,
  viewportHeight: number
) {
  const isLargeGroup = group.tabs.length >= CARD_GRID_VIRTUALIZATION_THRESHOLD;
  const metrics = VIEW_METRICS[view];
  const effectiveColumns = view === "list" ? 1 : Math.max(1, columns);
  const totalRows = Math.ceil(group.tabs.length / effectiveColumns);
  const firstRow = isLargeGroup
    ? Math.max(0, Math.floor(Math.max(0, scrollOffset - GROUP_CHROME_HEIGHT) / metrics.rowHeight) - 2)
    : 0;
  const rowCount = isLargeGroup
    ? Math.min(totalRows - firstRow, Math.ceil(viewportHeight / metrics.rowHeight) + 4)
    : totalRows;
  const firstTabIndex = firstRow * effectiveColumns;
  return {
    isLargeGroup,
    metrics,
    totalRows,
    firstRow,
    firstTabIndex,
    tabs: group.tabs.slice(firstTabIndex, firstTabIndex + rowCount * effectiveColumns)
  };
}

const StaticGroupPreview = memo(function StaticGroupPreview({
  group,
  spaceId,
  view,
  collapsed,
  pinned,
  zenMode,
  columns,
  scrollOffset,
  viewportHeight,
  activeDragType,
  buffered,
  showWarmFavicons,
  t,
  onOpenTab
}: {
  group: TabGroup;
  spaceId: string;
  view: CollectionView;
  collapsed: boolean;
  pinned: boolean;
  zenMode: boolean;
  columns: number;
  scrollOffset: number;
  viewportHeight: number;
  activeDragType: XingLuoTabDragData["type"] | null;
  buffered: boolean;
  showWarmFavicons: boolean;
  t: Translate;
  onOpenTab: (tab: RecordTab, event: MouseEvent) => void;
}) {
  const previewWindow = getStaticPreviewTabWindow(group, view, columns, scrollOffset, viewportHeight);
  const groupDropEnabled = activeDragType === "group" || activeDragType === "tab" || activeDragType === "session-tab";
  const tabDropEnabled = activeDragType === "tab" || activeDragType === "session-tab";
  const groupDroppableId = buffered
    ? `${dndId.group(spaceId, group.id)}:buffered-preview`
    : dndId.group(spaceId, group.id);
  const groupDroppable = useDroppable({
    id: groupDroppableId,
    data: { type: "group", spaceId, groupId: group.id } satisfies GroupDragData,
    disabled: buffered || !groupDropEnabled
  });
  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (activeDragType) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-static-tab-index]");
    if (!target) return;
    const tab = group.tabs[Number(target.dataset.staticTabIndex)];
    if (tab) onOpenTab(tab, event);
  };
  const previewGrid = previewWindow.tabs.length > 0 ? (
    <div className={getTabGridClassName(view)}>
      {previewWindow.tabs.map((tab, previewOffset) => {
        const props = {
          spaceId,
          groupId: group.id,
          tab,
          tabIndex: previewWindow.firstTabIndex + previewOffset,
          view,
          reserveActions: !zenMode,
          showWarmFavicons
        };
        return tabDropEnabled
          ? <StaticTabDropPreviewCard key={tab.id} {...props} />
          : <StaticTabPreviewCard key={tab.id} {...props} />;
      })}
    </div>
  ) : null;

  return (
    <article
      ref={groupDroppable.setNodeRef}
      data-group-static-preview="true"
      data-static-droppable-id={groupDropEnabled ? groupDroppableId : undefined}
      data-group-id={group.id}
      data-dnd-over={groupDroppable.isOver || undefined}
      aria-busy="true"
      onClick={handleClick}
      className={[
        "h-full min-h-12 overflow-hidden border-b px-4 pb-3 pt-2 transition-colors last:border-b-0",
        zenMode ? "zen-group my-3 rounded-2xl border-b-0 px-5 py-4" : "",
        groupDroppable.isOver ? "bg-accent/70" : ""
      ].join(" ")}
    >
      <header className="group/header mb-2 flex items-center justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {pinned ? <Pin className="h-4 w-4 shrink-0 text-blue-500" /> : zenMode ? null : <GripVertical className="h-4 w-4 shrink-0 text-gray-400" />}
          <h2 className={["min-w-0 truncate text-sm", zenMode ? "font-semibold" : "font-medium"].join(" ")}>{group.name}</h2>
          {zenMode ? null : (
            <span className="flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground">
              <Tag className="h-3.5 w-3.5" />
              <span>{(group.tags?.length ?? 0) > 0 ? t("space.editTags") : t("space.addTags")}</span>
            </span>
          )}
          {(group.tags ?? []).map((tag) => (
            <span key={tag} data-group-tag={tag} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {tag}
            </span>
          ))}
          {zenMode ? null : (
            <span className="flex h-8 min-w-8 flex-1 flex-row items-center text-muted-foreground">
              <ChevronDown className={["h-4 w-4", collapsed ? "-rotate-90" : "rotate-0"].join(" ")} />
            </span>
          )}
        </div>
        {zenMode ? null : (
          <div aria-hidden="true" className="flex shrink-0 flex-row items-center gap-2 opacity-0">
            <span className="h-9 w-9" />
            <span className="h-9 w-9" />
            <span className="h-9 w-9" />
          </div>
        )}
      </header>
      {collapsed ? null : previewWindow.tabs.length === 0 ? (
        <div className="flex min-h-[60px] items-center justify-center rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
          <div
            data-empty-group="true"
            className="empty-placeholder pointer-events-none w-full rounded-md border-2 border-dashed border-gray-200 py-4 text-center transition-colors data-[tab-drop-preview=true]:border-blue-400 data-[tab-drop-preview=true]:bg-blue-50/70 dark:border-gray-700 dark:data-[tab-drop-preview=true]:border-blue-500 dark:data-[tab-drop-preview=true]:bg-blue-950/30"
          >
            <p className="text-gray-400">{t("space.emptyGroup")}</p>
          </div>
        </div>
      ) : previewWindow.isLargeGroup ? (
        <div className="relative w-full" style={{ height: `${previewWindow.totalRows * previewWindow.metrics.rowHeight}px` }}>
          <div className="absolute inset-x-0" style={{ top: `${previewWindow.firstRow * previewWindow.metrics.rowHeight}px` }}>
            {previewGrid}
          </div>
        </div>
      ) : previewGrid}
    </article>
  );
});

type StaticTabPreviewCardProps = {
  spaceId: string;
  groupId: string;
  tab: RecordTab;
  tabIndex: number;
  view: CollectionView;
  reserveActions: boolean;
  showWarmFavicons: boolean;
};

function StaticTabDropPreviewCard(props: StaticTabPreviewCardProps) {
  const droppableId = dndId.tab(props.spaceId, props.groupId, props.tab.id);
  const droppable = useDroppable({
    id: droppableId,
    data: { type: "tab", spaceId: props.spaceId, groupId: props.groupId, tabId: props.tab.id } satisfies TabDragData
  });
  return <StaticTabPreviewCard {...props} nodeRef={droppable.setNodeRef} isOver={droppable.isOver} droppableId={droppableId} />;
}

function StaticTabPreviewCard({ tab, tabIndex, view, reserveActions, showWarmFavicons, nodeRef, isOver = false, droppableId }: StaticTabPreviewCardProps & {
  nodeRef?: (node: HTMLDivElement | null) => void;
  isOver?: boolean;
  droppableId?: string;
}) {
  return (
    <div
      ref={nodeRef}
      data-static-tab-preview="true"
      data-record-tab-surface="true"
      data-static-droppable-id={droppableId}
      data-static-tab-index={tabIndex}
      data-tab-id={tab.id}
      data-tab-index={tabIndex}
      data-dnd-over={isOver || undefined}
      title={tab.title || tab.url}
      className={[
        "relative flex flex-row items-center rounded-md border bg-card text-card-foreground",
        view === "card" ? "h-14 p-2" : "",
        view === "list" ? "h-11 px-3 py-1.5" : "",
        view === "compact" ? "h-10 px-2 py-1" : "",
        view === "grid" ? "h-12 p-2" : "",
        isOver ? "border-primary bg-accent" : ""
      ].join(" ")}
    >
      <span
        hidden
        data-tab-drop-indicator="true"
        className="pointer-events-none absolute inset-y-1 z-10 w-1 rounded-full bg-blue-500 shadow-sm data-[drop-position=before]:left-0 data-[drop-position=after]:right-0"
      />
      <span className={[
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted",
        view === "card" ? "h-8 w-8" : view === "list" ? "h-7 w-7" : "h-6 w-6"
      ].join(" ")}>
        <FaviconPreview
          src={tab.favIconUrl}
          title={tab.title || tab.url}
          url={tab.url}
          showWarmIcon={showWarmFavicons}
          cacheRevision={getFaviconCacheRevision()}
        />
      </span>
      <div className="ml-2 min-w-0 flex-1">
        <p className={view === "card" ? "line-clamp-2 leading-5" : "truncate text-sm"}>{tab.title || tab.url}</p>
        {view === "list" ? <p className="truncate text-[11px] text-muted-foreground">{tab.url}</p> : null}
      </div>
      {reserveActions ? <span aria-hidden="true" className="ml-auto h-8 w-8 shrink-0" /> : null}
    </div>
  );
}

function SortableGroupSection({
  spaceId,
  groupId,
  disabled,
  zenMode,
  children
}: {
  spaceId: string;
  groupId: string;
  disabled: boolean;
  zenMode: boolean;
  children: (sortable: ReturnType<typeof useSortable>) => ReactNode;
}) {
  const sortable = useSortable({
    id: dndId.group(spaceId, groupId),
    data: { type: "group", spaceId, groupId } satisfies GroupDragData,
    disabled
  });

  return (
    <article
      ref={sortable.setNodeRef}
      data-group-card="true"
      data-group-id={groupId}
      data-dnd-over={sortable.isOver || undefined}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition ?? "transform 220ms ease"
      }}
      className={[
        "border-b px-4 pb-3 pt-2 transition-colors last:border-b-0",
        zenMode ? "zen-group my-3 rounded-2xl border-b-0 px-5 py-4" : "",
        sortable.isOver ? "bg-accent/70" : "",
        sortable.isDragging ? "z-20 opacity-30" : ""
      ].join(" ")}
    >
      {children(sortable)}
    </article>
  );
}

function VirtualizedTabGrid({
  scrollElementRef,
  virtualGroupStart,
  initialColumns,
  spaceId,
  group,
  view,
  disabled,
  t,
  onOpenTab,
  onEditTab,
  onMoveTab,
  onDeleteTab
}: {
  scrollElementRef: { current: HTMLDivElement | null };
  virtualGroupStart: number;
  initialColumns: number;
  spaceId: string;
  group: TabGroup;
  view: CollectionView;
  disabled: boolean;
  t: Translate;
  onOpenTab: (tab: RecordTab, event: MouseEvent) => void | Promise<void>;
  onEditTab: (tab: RecordTab) => void;
  onMoveTab: (tab: RecordTab) => void;
  onDeleteTab: (tab: RecordTab) => void;
}) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState({
    columns: view === "list" ? 1 : Math.max(1, initialColumns),
    offsetTop: 0
  });
  const metrics = VIEW_METRICS[view];

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const update = () => {
      const width = grid.clientWidth;
      const columns = view === "list" ? 1 : Math.max(1, Math.floor((width + metrics.gap) / (metrics.minWidth + metrics.gap)));
      const offsetTop = grid.offsetTop;
      setLayout((current) =>
        current.columns === columns && current.offsetTop === offsetTop ? current : { columns, offsetTop }
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(grid);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [metrics.gap, metrics.minWidth, view]);

  const rowCount = Math.ceil(group.tabs.length / layout.columns);
  const scrollMargin = virtualGroupStart + layout.offsetTop;
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => metrics.rowHeight,
    getItemKey: (rowIndex) => group.tabs[rowIndex * layout.columns]?.id ?? rowIndex,
    overscan: 6,
    scrollMargin,
    isScrollingResetDelay: 180,
    useFlushSync: false
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const windowStart = (virtualRows[0]?.start ?? scrollMargin) - scrollMargin;

  return (
    <div ref={gridRef} data-virtual-tab-grid="true" className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
      <div className="w-full will-change-transform" style={{ transform: `translate3d(0, ${windowStart}px, 0)` }}>
      {virtualRows.map((virtualRow) => {
        const startIndex = virtualRow.index * layout.columns;
        const rowTabs = group.tabs.slice(startIndex, startIndex + layout.columns);
        return (
          <div
            key={virtualRow.key}
            data-virtual-tab-row={virtualRow.index}
            className="grid w-full"
            style={{
              height: `${metrics.rowHeight}px`,
              gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
              gap: `${metrics.gap}px`
            }}
          >
            {rowTabs.map((tab, rowOffset) => (
              <TabCard
                key={tab.id}
                spaceId={spaceId}
                groupId={group.id}
                tab={tab}
                tabIndex={startIndex + rowOffset}
                view={view}
                disabled={disabled}
                t={t}
                onOpen={(event) => void onOpenTab(tab, event)}
                onEdit={() => void onEditTab(tab)}
                onMove={() => void onMoveTab(tab)}
                onDelete={() => void onDeleteTab(tab)}
              />
            ))}
          </div>
        );
      })}
      </div>
    </div>
  );
}

function TabCard({
  spaceId,
  groupId,
  tab,
  tabIndex,
  view,
  disabled,
  t,
  onOpen,
  onEdit,
  onMove,
  onDelete
}: {
  spaceId: string;
  groupId: string;
  tab: RecordTab;
  tabIndex: number;
  view: CollectionView;
  disabled: boolean;
  t: Translate;
  onOpen: (event: MouseEvent) => void;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const sortable = useSortable({
    id: dndId.tab(spaceId, groupId, tab.id),
    data: { type: "tab", spaceId, groupId, tabId: tab.id } satisfies TabDragData,
    disabled
  });

  return (
    <div
      ref={sortable.setNodeRef}
      data-record-tab-card="true"
      data-record-tab-surface="true"
      data-tab-id={tab.id}
      data-tab-index={tabIndex}
      data-dnd-over={sortable.isOver || undefined}
       {...(disabled ? {} : sortable.attributes)}
       {...(disabled ? {} : sortable.listeners)}
      onClick={onOpen}
      title={tab.title || tab.url}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition ?? "transform 200ms ease"
      }}
      className={[
         "group/tab relative flex touch-none flex-row items-center rounded-md border bg-card text-card-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
         disabled ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
         view === "card" ? "h-14 p-2" : "",
         view === "list" ? "h-11 px-3 py-1.5" : "",
         view === "compact" ? "h-10 px-2 py-1" : "",
         view === "grid" ? "h-12 p-2" : "",
        sortable.isOver ? "border-primary bg-accent" : "",
        sortable.isDragging ? "z-20 opacity-25" : ""
      ].join(" ")}
    >
      <span
        hidden
        data-tab-drop-indicator="true"
        className="pointer-events-none absolute inset-y-1 z-10 w-1 rounded-full bg-blue-500 shadow-sm data-[drop-position=before]:left-0 data-[drop-position=after]:right-0"
      />
      <span className={[
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted",
        view === "card" ? "h-8 w-8" : view === "list" ? "h-7 w-7" : "h-6 w-6"
      ].join(" ")}>
        <Favicon src={tab.favIconUrl} title={tab.title || tab.url} url={tab.url} />
      </span>
      <div className="ml-2 min-w-0 flex-1">
        <p className={view === "card" ? "line-clamp-2 leading-5" : "truncate text-sm"}>{tab.title || tab.url}</p>
        {view === "list" ? <p className="truncate text-[11px] text-muted-foreground">{tab.url}</p> : null}
      </div>
      {disabled ? null : <span
        className="ml-auto pointer-events-none"
        data-no-dnd="true"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
        }}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              title={t("space.tabActions")}
              className="pointer-events-auto h-8 w-8 p-0 opacity-0 transition-opacity group-focus-within/tab:opacity-100 group-hover/tab:opacity-100"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="pointer-events-auto">
            <DropdownMenuItem data-action="edit-tab" onSelect={onEdit}>
              <Edit3 className="h-4 w-4" />
              <span>{t("common.edit")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem data-action="move-tab" onSelect={onMove}>
              <MoveRight className="h-4 w-4" />
              <span>{t("common.moveTo")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem data-action="delete-tab" destructive onSelect={onDelete}>
              <Trash2 className="h-4 w-4" />
              <span>{t("common.delete")}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>}
    </div>
  );
}

function getTabGridClassName(view: CollectionView) {
  if (view === "list") return "grid grid-cols-1 gap-2";
  if (view === "compact") return "grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2";
  if (view === "grid") return "grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2";
  return "grid grid-group gap-4";
}

function DndDragPreview({
  data,
  space,
  spaces,
  sessionTabs
}: {
  data: XingLuoTabDragData | null;
  space: Space | null;
  spaces: SpaceSummary[];
  sessionTabs: SessionTab[];
}) {
  if (!data) return null;
  if (data.type === "space") {
    const item = spaces.find((summary) => summary.id === data.spaceId);
    return item ? <div className="w-56 rounded-md border bg-card px-3 py-2 text-sm font-medium shadow-lg">{item.name}</div> : null;
  }
  if (data.type === "group") {
    const group = space?.groups.find((item) => item.id === data.groupId);
    return group ? (
      <div className="w-[min(32rem,70vw)] rounded-md border bg-card px-4 py-3 shadow-xl">
        <div className="text-sm font-medium">{group.name}</div>
        <div className="mt-1 text-xs text-muted-foreground">{group.tabs.length}</div>
      </div>
    ) : null;
  }

  const tab =
    data.type === "session-tab"
      ? sessionTabs.find((item) => item.id === data.tabId)
      : space?.groups.flatMap((group) => group.tabs).find((item) => item.id === data.tabId);
  return tab ? (
    <div className="flex h-[3.5rem] w-64 items-center rounded-md border bg-card p-2 shadow-xl">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        <Favicon src={tab.favIconUrl} title={tab.title || tab.url} url={tab.url} />
      </span>
      <span className="ml-2 line-clamp-2 min-w-0 flex-1 text-sm">{tab.title || tab.url}</span>
    </div>
  ) : null;
}

const detectXingLuoTabCollision: CollisionDetection = (args) => {
  const activeData = args.active.data.current;
  if (!isXingLuoTabDragData(activeData)) return closestCenter(args);

  const allowsType = (type: XingLuoTabDragData["type"]) => {
    if (activeData.type === "space") return type === "space";
    if (activeData.type === "group") return type === "group" || type === "space";
    return type === "tab" || type === "group" || type === "space";
  };
  const priority = (type: XingLuoTabDragData["type"]) => {
    if (activeData.type === "space") return type === "space" ? 0 : 99;
    if (activeData.type === "group") return type === "group" ? 0 : 1;
    if (type === "tab") return 0;
    if (type === "group") return 1;
    return 2;
  };
  const droppableContainers = args.droppableContainers.filter((container) => {
    const data = container.data.current;
    if (container.id === args.active.id || !isXingLuoTabDragData(data) || !allowsType(data.type)) return false;
    if (
      data.type === "space" &&
      (activeData.type === "tab" || activeData.type === "group") &&
      data.spaceId === activeData.spaceId
    ) {
      return false;
    }
    return true;
  });
  const filteredArgs = { ...args, droppableContainers };
  const candidates = args.pointerCoordinates ? pointerWithin(filteredArgs) : closestCenter(filteredArgs);
  let bestCollision: (typeof candidates)[number] | null = null;
  let bestPriority = 99;

  for (const candidate of candidates) {
    const data = candidate.data?.droppableContainer.data.current;
    if (!isXingLuoTabDragData(data)) continue;
    const candidatePriority = priority(data.type);
    if (candidatePriority >= bestPriority) continue;
    bestPriority = candidatePriority;
    bestCollision = candidate;
    if (bestPriority === 0) break;
  }

  return bestCollision ? [bestCollision] : [];
};

const xingLuoTabCollisionController = createBufferedCollisionDetection(detectXingLuoTabCollision, {
  intervalMs: 40,
  switchDelayMs: 45,
  movementThresholdPx: 12
});

const xingLuoTabCollisionDetection = xingLuoTabCollisionController.detect;

function SearchResults({
  rows,
  t,
  onOpen
}: {
  rows: SearchRecord[];
  t: Translate;
  onOpen: (row: SearchRecord, event: MouseEvent) => void;
}) {
  if (rows.length === 0) return <StatusLine text={t("search.noMatches")} />;

  return (
    <div className="divide-y rounded-md border bg-card">
      {rows.map((row) => (
        <button
          key={row.tabId}
          data-search-result-row="true"
          className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50"
          onClick={(event) => onOpen(row, event)}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{row.title || row.url}</div>
            <div className="truncate text-xs text-muted-foreground">
              {row.spaceName} / {row.groupName} / {row.url}
            </div>
          </div>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}

function getUrlHost(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname || parsed.protocol;
  } catch {
    return "Local";
  }
}

function StatusLine({ text, tone = "muted" }: { text: string; tone?: "muted" | "error" }) {
  return (
    <div
      className={[
        "rounded-md border px-3 py-2 text-sm",
        tone === "error" ? "border-destructive/40 text-destructive" : "text-muted-foreground"
      ].join(" ")}
    >
      {text}
    </div>
  );
}
