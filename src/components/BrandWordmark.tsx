import clsx from "clsx";

import { APP_NAME } from "../lib/brand";

type BrandWordmarkSize = "sm" | "lg" | "auth";

export function BrandWordmark({
  size = "sm",
  className,
}: {
  size?: BrandWordmarkSize;
  className?: string;
}) {
  return (
    <span
      className={clsx("brand-wordmark", `brand-wordmark--${size}`, className)}
      aria-label={APP_NAME}
    >
      <span>Tailor</span>
      <span className="brand-wordmark__it">it</span>
    </span>
  );
}
