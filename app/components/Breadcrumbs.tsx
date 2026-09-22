"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  /** Omit only for a trailing "current page" crumb — it renders as plain text, not a link. */
  href?: string;
  /**
   * Intercepts the click instead of letting the Link navigate — for a page
   * that needs to confirm discarding unsaved work first. Call
   * `e.preventDefault()` and drive the actual navigation (e.g. `router.push`)
   * from here once that's settled.
   */
  onNavigate?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * "Lead Sheets / Setlists / <name>" — every crumb with an href is a link back
 * up the hierarchy; a trailing crumb with none is the current page and isn't
 * one. 44px touch targets throughout: this exists so a tap on a phone or
 * tablet lands.
 */
export function Breadcrumbs({ items, className = "" }: { items: BreadcrumbItem[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label='Breadcrumb' className={`flex flex-wrap items-center gap-0.5 text-13 text-ink-muted ${className}`}>
      {items.map((item, i) => (
        <span key={`${item.href ?? item.label}-${i}`} className='flex items-center gap-0.5 min-w-0'>
          {i > 0 && <ChevronRight className='w-3.5 h-3.5 shrink-0 opacity-60' aria-hidden='true' />}
          {item.href ? (
            <Link
              href={item.href}
              onClick={item.onNavigate}
              className='flex min-h-[44px] items-center rounded px-1.5 font-medium transition-colors hover:bg-surface-overlay hover:text-ink-primary'
            >
              {item.label}
            </Link>
          ) : (
            <span className='flex min-h-[44px] items-center truncate px-1.5 font-medium text-ink-primary' aria-current='page'>
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
