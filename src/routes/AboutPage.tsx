import { Bookmark, Braces, Layers3, Quote, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { BrandMark } from "../components/brand/BrandMark";
import { useI18n } from "../features/i18n/useI18n";

const REVEREND_INSANITY_VERSE = [
  "魂牵梦绕风云荡，星圆土方三界坛。",
  "生死轮回一门开，再启杀劫洗铅华。",
  "不过些许风霜罢了"
] as const;

const TECH_STACK = ["WXT", "React 18", "TypeScript", "Tailwind CSS", "Radix UI", "dnd-kit", "TanStack Virtual", "Vitest"] as const;

export function AboutPage() {
  const { t } = useI18n();
  const version = chrome.runtime.getManifest().version;

  return (
    <div className="h-full w-full overflow-y-auto">
      <header className="flex h-14 items-center border-b px-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">{t("about.title")}</h1>
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">v{version}</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 p-4 pb-12 sm:p-6 sm:pb-14">
        <section className="relative overflow-hidden rounded-3xl border bg-card shadow-sm">
          <div aria-hidden="true" className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div aria-hidden="true" className="absolute -bottom-28 left-1/4 h-64 w-64 rounded-full bg-accent/70 blur-3xl" />

          <div className="relative p-5 sm:p-7 lg:p-9">
            <div className="flex min-w-0 flex-col justify-center">
              <div className="mb-5 flex items-center gap-3">
                <BrandMark className="h-14 w-14 rounded-2xl shadow-sm ring-1 ring-border" />
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium tracking-[0.18em] text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    XINGLUOTAB
                  </div>
                  <h2 className="truncate text-2xl font-semibold tracking-tight">{t("brand.name")}</h2>
                </div>
              </div>

              <p className="max-w-2xl text-base leading-7 text-foreground/90">{t("about.description")}</p>

              <div className="mt-6 grid max-w-3xl gap-3 sm:grid-cols-2">
                <FeatureCard icon={<Layers3 className="h-4 w-4" />} text={t("about.featureSpaces")} />
                <FeatureCard icon={<Bookmark className="h-4 w-4" />} text={t("about.featureCurrentTabs")} />
              </div>
            </div>
          </div>
        </section>

        <figure
          data-about-poem="true"
          className="relative isolate flex min-h-[22rem] flex-col items-center justify-center overflow-hidden rounded-3xl border bg-card px-5 py-12 shadow-sm sm:px-10 sm:py-14"
        >
          <div aria-hidden="true" className="absolute -left-24 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div aria-hidden="true" className="absolute -right-20 top-0 h-56 w-56 rounded-full bg-accent/70 blur-3xl" />
          <div aria-hidden="true" className="absolute inset-x-[12%] top-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent" />
          <Quote aria-hidden="true" className="absolute right-7 top-7 h-12 w-12 text-primary/10 sm:right-10 sm:top-9" />

          <figcaption className="relative mb-8 flex items-center gap-3 text-xs font-medium tracking-[0.32em] text-primary">
            <span aria-hidden="true" className="h-px w-8 bg-primary/40" />
            蛊真人
            <span aria-hidden="true" className="h-px w-8 bg-primary/40" />
          </figcaption>

          <blockquote className="relative space-y-3 text-center font-serif text-base font-medium leading-8 tracking-[0.08em] text-foreground sm:text-xl sm:leading-10 sm:tracking-[0.16em]">
            {REVEREND_INSANITY_VERSE.slice(0, 2).map((line) => (
              <p key={line}>{line}</p>
            ))}
            <div aria-hidden="true" className="mx-auto my-6 flex w-28 items-center gap-2">
              <span className="h-px flex-1 bg-border" />
              <Sparkles className="h-3.5 w-3.5 text-primary/60" />
              <span className="h-px flex-1 bg-border" />
            </div>
            <p className="text-sm tracking-[0.22em] text-muted-foreground sm:text-base sm:tracking-[0.3em]">
              {REVEREND_INSANITY_VERSE[2]}
            </p>
          </blockquote>

          <div aria-hidden="true" className="absolute inset-x-[22%] bottom-7 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        </figure>

        <section data-about-tech-stack="true" className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-8">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Braces className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{t("about.techStackTitle")}</h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">{t("about.techStackDescription")}</p>
              </div>
            </div>
            <div className="flex max-w-2xl flex-wrap gap-2 md:justify-end">
              {TECH_STACK.map((technology) => (
                <span
                  key={technology}
                  className="rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-foreground/80 shadow-sm"
                >
                  {technology}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-muted/25 p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bookmark className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-semibold">{t("about.usageScaleTitle")}</h2>
          </div>
          <div className="grid gap-2 text-sm leading-6 text-muted-foreground md:grid-cols-2 md:gap-6">
            <p>{t("about.usageScaleComfort")}</p>
            <p>{t("about.usageScaleLarge")}</p>
          </div>
        </section>
      </main>
    </div>
  );
}

function FeatureCard({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex min-w-0 gap-3 rounded-xl border bg-background/65 p-3.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      <p className="text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  );
}
