import { Archive, ArrowUpDown, PanelRightClose, PanelRightOpen, Pin, X } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";
import { Button } from "../../components/ui/button";
import { Favicon } from "../../components/ui/Favicon";
import type { SessionTab } from "../../domain/space/schema";
import { dndId, type SessionTabDragData } from "../dnd/dragData";
import { useI18n } from "../i18n/useI18n";

type SessionBarProps = {
  isCollapsed: boolean;
  tabs: SessionTab[];
  sortDirection: "asc" | "desc";
  onToggleCollapsed: () => void;
  onToggleSort: () => void;
  onSaveAll: () => void;
  onActivateTab: (tab: SessionTab) => void;
  onCloseTab: (tab: SessionTab) => void;
};

export function SessionBar({
  isCollapsed,
  tabs,
  sortDirection,
  onToggleCollapsed,
  onToggleSort,
  onSaveAll,
  onActivateTab,
  onCloseTab
}: SessionBarProps) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const visibleTabs = useMemo(() => (sortDirection === "asc" ? [...tabs].reverse() : tabs), [sortDirection, tabs]);
  const tabVirtualizer = useVirtualizer({
    count: isCollapsed ? 0 : visibleTabs.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => visibleTabs[index]?.id ?? index,
    estimateSize: () => 72,
    overscan: 4,
    useAnimationFrameWithResizeObserver: true
  });

  return (
    <aside
      data-session-bar="true"
      className={["relative shrink-0 transition-all duration-300 ease-in-out", isCollapsed ? "w-8" : "w-64"].join(" ")}
    >
      <button
        type="button"
        title={isCollapsed ? t("session.expand") : t("session.collapse")}
        aria-label={isCollapsed ? t("session.expand") : t("session.collapse")}
        onClick={onToggleCollapsed}
        className="absolute -left-3 top-3 z-20 rounded-full border bg-card p-1 text-card-foreground shadow-sm hover:bg-accent hover:text-accent-foreground"
      >
        {isCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
      </button>

      <div className="h-full border-l opacity-100">
        {!isCollapsed ? (
          <div className="relative flex h-full flex-col">
            <header className="sticky top-0 z-10 flex h-14 items-center justify-end bg-background/80 px-4 backdrop-blur-md">
              <Button size="sm" variant="ghost" title={t("common.sort")} className="mr-2" onClick={onToggleSort}>
                <ArrowUpDown className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" disabled={tabs.length === 0} onClick={onSaveAll}>
                <Archive className="h-4 w-4" />
                {t("session.save")}
              </Button>
            </header>

            <div ref={scrollRef} data-session-tabs-scroll="true" className="min-h-0 flex-1 overflow-auto">
              {visibleTabs.length > 0 ? (
                <div
                  className="relative mx-4 mt-4"
                  style={{ height: `${tabVirtualizer.getTotalSize()}px`, contain: "layout style paint" }}
                >
                  {tabVirtualizer.getVirtualItems().map((virtualTab) => {
                    const tab = visibleTabs[virtualTab.index];
                    if (!tab) return null;
                    return (
                      <div
                        key={virtualTab.key}
                        data-session-virtual-row={virtualTab.index}
                        className="absolute left-0 top-0 w-full pb-4"
                        style={{ height: `${virtualTab.size}px`, transform: `translateY(${virtualTab.start}px)` }}
                      >
                        <DraggableSessionTab
                          tab={tab}
                          closeLabel={t("session.closeTab")}
                          onActivate={() => onActivateTab(tab)}
                          onClose={() => onCloseTab(tab)}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function DraggableSessionTab({
  tab,
  closeLabel,
  onActivate,
  onClose
}: {
  tab: SessionTab;
  closeLabel: string;
  onActivate: () => void;
  onClose: () => void;
}) {
  const draggable = useDraggable({
    id: dndId.sessionTab(tab.id),
    data: { type: "session-tab", tabId: tab.id } satisfies SessionTabDragData
  });

  return (
    <article
      ref={draggable.setNodeRef}
      data-session-tab-card="true"
      title={tab.title || tab.url}
      {...draggable.attributes}
      {...draggable.listeners}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) onActivate();
      }}
      style={{ transform: CSS.Translate.toString(draggable.transform) }}
      className={[
        "group relative flex h-[3.5rem] cursor-grab touch-none flex-row items-center rounded-md border bg-card p-2 text-card-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:cursor-grabbing",
        draggable.isDragging ? "opacity-30" : ""
      ].join(" ")}
    >
      {tab.pinned ? (
        <span className="absolute left-0 top-0 h-7 w-7 overflow-hidden rounded-tl-md">
          <span className="absolute -left-5 -top-5 h-10 w-10 rotate-[135deg] bg-zinc-200 dark:bg-zinc-700" />
          <Pin className="absolute left-[4px] top-[4px] h-2 w-2 text-zinc-600 dark:text-zinc-300" />
        </span>
      ) : null}
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        <Favicon src={tab.favIconUrl} title={tab.title || tab.url} url={tab.url} />
      </span>
      <p className="ml-2 line-clamp-2 min-w-0 flex-1 leading-5">{tab.title || tab.url}</p>
      {!tab.pinned ? (
        <div className="ml-auto pointer-events-none" data-no-dnd="true" onPointerDown={(event) => event.stopPropagation()}>
          <Button
            size="sm"
            variant="ghost"
            title={closeLabel}
            aria-label={closeLabel}
            className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100 pointer-events-auto"
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              onClose();
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </article>
  );
}
