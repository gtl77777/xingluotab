import { Circle, type LucideIcon, type LucideProps } from "lucide-react";
import dynamicIconImports from "lucide-react/dynamicIconImports";
import { useEffect, useState } from "react";

export const SPACE_ICON_NAMES = [
  "activity", "airplay", "alarm-clock", "album", "ambulance", "anchor", "angry", "annoyed", "antenna", "anvil",
  "aperture", "app-window", "app-window-mac", "apple", "archive", "armchair", "at-sign", "atom", "audio-lines",
  "audio-waveform", "award", "axe", "baby", "backpack", "badge-cent", "badge-check", "badge-dollar-sign", "badge-euro",
  "badge-help", "badge-indian-rupee", "badge-japanese-yen", "badge-percent", "badge-plus", "badge-pound-sterling",
  "badge-russian-ruble", "badge-swiss-franc", "badge-x", "baggage-claim", "ban", "banana", "bandage", "banknote", "bath",
  "battery-charging", "battery-medium", "beaker", "bean", "bed-single", "beef", "beer", "bell", "bell-ring",
  "biceps-flexed", "bike", "binary", "biohazard", "bird", "bitcoin", "blocks", "bolt", "bone", "book", "book-a",
  "book-image", "book-marked", "book-open", "book-open-text", "bookmark", "bookmark-check", "bookmark-x", "bot", "box",
  "briefcase-business", "brush", "building-2", "bus", "cake", "cake-slice", "calculator", "calendar", "calendar-1",
  "calendar-check", "calendar-days", "calendar-fold", "calendar-range", "camera", "car", "car-front", "car-taxi-front",
  "carrot", "cat", "cctv", "chart-bar-big", "chart-gantt", "chart-line", "chart-network", "chart-no-axes-combined",
  "chart-pie", "check", "check-check", "chef-hat", "cherry", "chrome", "church", "cigarette", "circle-alert",
  "circle-arrow-down", "circle-arrow-out-up-right", "circle-check", "circle-check-big", "circle-dollar-sign", "circle-help",
  "circle-parking", "circle-play", "circle-user", "circle-user-round", "clapperboard", "clock", "cloud", "cloudy", "code",
  "code-xml", "coffee", "cog", "coins", "command", "compass", "contact", "contact-round", "cookie", "cooking-pot", "cpu",
  "credit-card", "crop", "crown", "cup-soda", "database", "diamond", "diamond-plus", "dice-1", "dice-2", "dice-3",
  "dice-4", "dice-5", "dice-6", "disc", "disc-album", "dna", "dock", "dog", "dollar-sign", "facebook", "feather",
  "figma", "file", "file-json", "file-json-2", "file-text", "files", "film", "fingerprint", "fish", "flag",
  "flask-conical", "flower", "flower-2", "folder", "folder-closed", "folder-open", "folder-output", "frame", "frown",
  "fuel", "gamepad-2", "gauge", "gem", "ghost", "gift", "git-merge", "github", "gitlab", "glass-water", "glasses",
  "globe", "graduation-cap", "grid-2x2", "grid-3x3", "grip", "grip-horizontal", "grip-vertical", "guitar", "ham",
  "hammer", "hand", "handshake", "hash", "haze", "headphones", "heart", "hexagon", "history", "hospital", "hourglass",
  "house", "id-card", "image", "inbox", "info", "instagram", "laugh", "leaf", "loader-pinwheel", "lock", "lollipop",
  "mail", "mails", "map", "map-pin", "meh", "message-square", "message-square-text", "mic", "mic-vocal", "milestone",
  "moon", "mountain-snow", "music", "navigation", "octagon", "package-2", "paintbrush", "palette", "panels-top-left",
  "paperclip", "party-popper", "paw-print", "pen-tool", "pencil", "pentagon", "phone", "pi", "pickaxe", "piggy-bank",
  "pizza", "plane", "quote", "radiation", "rainbow", "rat", "ratio", "recycle", "rocket", "rotate-3d", "save",
  "search", "send", "send-horizontal", "server", "settings", "share-2", "shield-check", "ship-wheel", "shirt", "shuffle",
  "signpost", "skull", "slack", "smile", "snail", "sofa", "soup", "sparkle", "sparkles", "speaker", "square",
  "square-arrow-out-up-right", "square-check", "squircle", "store", "swatch-book", "tag", "tags", "target",
  "thumbs-down", "thumbs-up", "tickets", "trash", "trash-2", "tree-palm", "tree-pine", "trophy", "truck", "tv",
  "tv-minimal-play", "twitch", "twitter", "university", "video", "volleyball", "watch", "webhook", "wrench", "youtube",
  "zap"
] as const;

export type SpaceIconName = (typeof SPACE_ICON_NAMES)[number];

const knownSpaceIconNames = new Set<string>(SPACE_ICON_NAMES);
const iconCache = new Map<string, LucideIcon>();
const legacySpaceIconNames: Partial<Record<string, SpaceIconName>> = {
  BookOpen: "book-open",
  Briefcase: "briefcase-business",
  Code2: "code",
  Compass: "compass",
  FolderOpen: "folder-open",
  Heart: "heart",
  Home: "house",
  Star: "sparkle",
  Zap: "zap"
};

export function isKnownSpaceIcon(name: string): name is SpaceIconName {
  return knownSpaceIconNames.has(name);
}

export function normalizeSpaceIconName(name?: string): SpaceIconName | undefined {
  if (!name) return undefined;
  if (isKnownSpaceIcon(name)) return name;
  return legacySpaceIconNames[name];
}

export function SpaceIcon({ name, ...props }: LucideProps & { name?: string }) {
  const normalizedName = normalizeSpaceIconName(name);
  const [Icon, setIcon] = useState<LucideIcon | null>(() =>
    normalizedName ? iconCache.get(normalizedName) ?? null : null
  );

  useEffect(() => {
    let mounted = true;
    if (!normalizedName) {
      setIcon(null);
      return () => {
        mounted = false;
      };
    }

    const cached = iconCache.get(normalizedName);
    if (cached) {
      setIcon(() => cached);
      return () => {
        mounted = false;
      };
    }

    const loader = dynamicIconImports[normalizedName];
    setIcon(null);
    void loader?.()
      .then((module) => {
        if (!mounted) return;
        iconCache.set(normalizedName, module.default);
        setIcon(() => module.default);
      })
      .catch(() => {
        if (mounted) setIcon(null);
      });
    return () => {
      mounted = false;
    };
  }, [normalizedName]);

  if (!normalizedName) return <Circle {...props} />;
  if (!Icon) return <span aria-hidden="true" className={props.className} />;
  return <Icon {...props} />;
}
