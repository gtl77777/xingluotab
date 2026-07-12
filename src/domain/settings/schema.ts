export type UserSetting = {
  isSessionBarCollapsed: boolean;
  isSidebarCollapsed: boolean;
  collapsedGroups: string[];
  openTabMode: "newtab" | "replace";
  openGroupMode: "nogroup" | "group";
  showPinnedSessionTab: "always" | "ignore";
  removeWhenClickWithAlt: "yes" | "no";
  language: string;
  newtab: "override" | "none";
  lastVisitedSpaceId?: string;
  sessionTabSort?: "asc" | "desc";
  theme?: "light" | "dark" | "system";
  accentTheme?: "pink" | "blue" | "purple" | "brown" | "green" | "summer" | "autumn" | "winter" | "spring";
  lightVisualTheme?: "professional" | "mica" | "aurora" | "paper";
  darkVisualTheme?: "professional" | "mica" | "aurora" | "oled";
  logoDataUrl?: string;
  zenMode?: boolean;
  zenTheme?: "minimal" | "ghibli" | "glass";
  collectionView?: "card" | "list" | "compact" | "grid";
  collectionSort?: "manual" | "alphabetical" | "starred" | "created";
};

export const defaultUserSetting: UserSetting = {
  isSessionBarCollapsed: false,
  isSidebarCollapsed: false,
  collapsedGroups: [],
  openTabMode: "newtab",
  openGroupMode: "nogroup",
  showPinnedSessionTab: "always",
  removeWhenClickWithAlt: "yes",
  language: "en",
  newtab: "override",
  theme: "light",
  accentTheme: "pink",
  lightVisualTheme: "professional",
  darkVisualTheme: "professional",
  zenMode: false,
  zenTheme: "minimal",
  collectionView: "card",
  collectionSort: "manual"
};
