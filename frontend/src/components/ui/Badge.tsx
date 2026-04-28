import { HTMLAttributes, forwardRef } from 'react'
import { twMerge } from 'tailwind-merge'
import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'slate' | 'indigo' | 'green' | 'amber' | 'red' | 'purple' | 'ai'
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'slate', ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(`badge badge-${variant}`, className)}
        {...props}
      />
    )
  }
)

Badge.displayName = 'Badge'
