"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        { "--normal-bg": "var(--background-secondary)", "--normal-text": "var(--foreground)", "--normal-border": "var(--border-secondary)", "--success-bg": "var(--success)", "--success-text": "var(--success-foreground)", "--success-border": "var(--border-success)", "--error-bg": "var(--destructive)", "--error-text": "var(--destructive-foreground)", "--error-border": "var(--border-destructive)", "--warning-bg": "var(--warning)", "--warning-text": "var(--warning-foreground)", "--warning-border": "var(--border-warning)", "--info-bg": "var(--info)", "--info-text": "var(--info-foreground)", "--info-border": "var(--border-info)" } as React.CSSProperties
      } 
      {...props}
    />
  )
}

export { Toaster }
