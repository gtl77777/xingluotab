type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className = "h-7 w-7" }: BrandMarkProps) {
  return <img src="/icon/128.png" alt="" aria-hidden="true" className={className} />;
}
