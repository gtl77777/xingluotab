import { useEffect, useState } from "react";
import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

function getDocumentTheme(): "light" | "dark" {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function Toaster(props: ToasterProps) {
  const [theme, setTheme] = useState<"light" | "dark">(getDocumentTheme);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setTheme(getDocumentTheme()));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <SonnerToaster
      theme={theme}
      position="top-right"
      richColors
      duration={4000}
      toastOptions={{
        classNames: {
          toast: "border-border bg-popover text-popover-foreground shadow-lg",
          description: "text-muted-foreground"
        }
      }}
      {...props}
    />
  );
}
