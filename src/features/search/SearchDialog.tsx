import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Dialog, DialogContent, DialogTitle } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Favicon } from "../../components/ui/Favicon";
import { useI18n } from "../i18n/useI18n";
import { useSpaceVersion } from "../storage/spaceVersionStore";
import { openUrl } from "../../platform/browser";
import { loadSearchIndex, searchTabs, type SearchRecord } from "./searchIndex";

type SearchDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function SearchDialog({ open, onClose }: SearchDialogProps) {
  const { t } = useI18n();
  const { revision } = useSpaceVersion();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<SearchRecord[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    let mounted = true;
    setLoading(true);
    setLoadFailed(false);
    void loadSearchIndex()
      .then((nextIndex) => {
        if (!mounted) return;
        setIndex(nextIndex);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setLoading(false);
        setLoadFailed(true);
      });

    window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      mounted = false;
    };
  }, [open, revision, t]);

  const results = useMemo(() => searchTabs(index, query), [index, query]);

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(results.length - 1, 0)));
  }, [results.length]);

  useEffect(() => {
    resultListRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  async function handleOpen(row: SearchRecord) {
    await openUrl(row.url, { active: true });
    closeDialog();
  }

  function closeDialog() {
    setQuery("");
    setSelectedIndex(0);
    onClose();
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) => (current + 1) % results.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((current) => (current - 1 + results.length) % results.length);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const selectedRow = results[selectedIndex] ?? results[0];
      if (selectedRow) void handleOpen(selectedRow);
    }
  }

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && closeDialog()}>
      <DialogContent
        hideCloseButton
        overlayClassName="bg-black/80"
        aria-label={t("search.dialogLabel")}
        className="grid max-h-[70vh] w-[min(calc(100vw-2rem),32rem)] max-w-lg grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden bg-card p-0"
      >
        <DialogTitle className="sr-only">{t("search.dialogLabel")}</DialogTitle>
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder={t("search.placeholder")}
            role="combobox"
            aria-expanded="true"
            aria-controls="xingluotab-search-results"
            aria-activedescendant={results[selectedIndex] ? getSearchResultId(results[selectedIndex]) : undefined}
            className="h-10 border-0 px-0 shadow-none focus-visible:ring-0"
          />
          <Button size="icon" variant="ghost" title={t("search.close")} className="h-8 w-8" onClick={closeDialog}>
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="min-h-0 overflow-auto">
          {loading && index.length === 0 ? (
            <SearchStatus text={t("search.loading")} />
          ) : loadFailed ? (
            <SearchStatus text={t("search.loadError")} />
          ) : results.length > 0 ? (
            <div id="xingluotab-search-results" ref={resultListRef} role="listbox" aria-label={t("search.result")}>
              <div className="px-4 py-2 text-xs text-muted-foreground">{t("search.result")}</div>
              {results.map((row, index) => (
                <button
                  id={getSearchResultId(row)}
                  key={`${row.spaceId}:${row.groupId}:${row.tabId}`}
                  data-search-result-row="true"
                  role="option"
                  aria-selected={index === selectedIndex}
                  className={[
                    "flex min-h-14 w-full items-center px-4 py-3 text-left hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none",
                    index === selectedIndex ? "bg-accent text-accent-foreground" : ""
                  ].join(" ")}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => void handleOpen(row)}
                >
                  <span className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                    <Favicon src={row.favIconUrl} title={row.title || row.url} url={row.url} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{row.title || row.url}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {row.spaceName} &gt; {row.groupName}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <SearchStatus text={t("search.noMatches")} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getSearchResultId(row: SearchRecord) {
  return `search-result-${row.spaceId}-${row.groupId}-${row.tabId}`.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function SearchStatus({ text }: { text: string }) {
  return <div className="px-4 py-3 text-sm text-muted-foreground">{text}</div>;
}
