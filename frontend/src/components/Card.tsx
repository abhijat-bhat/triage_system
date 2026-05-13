import type { ReactNode } from "react";
import { cn } from "../lib/utils";

interface Props {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Card({ title, description, action, className, children }: Props) {
  return (
    <section className={cn("panel p-6", className)}>
      {(title || description || action) && (
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-lg font-semibold text-ink-50">{title}</h2>}
            {description && (
              <p className="mt-1 text-sm text-ink-400">{description}</p>
            )}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
