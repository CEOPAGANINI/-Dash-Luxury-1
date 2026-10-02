"use client";

import {
  useState,
  type ComponentProps,
  type ReactNode,
  type ReactElement,
} from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertCircle,
  Check,
  Circle,
  Info,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type FlowTone = "neutral" | "success" | "warning" | "danger" | "info";
const icons = {
  neutral: Circle,
  success: Check,
  warning: TriangleAlert,
  danger: AlertCircle,
  info: Info,
};

export function FlowStatusBadge({
  tone = "neutral",
  busy = false,
  children,
  className,
  ...props
}: ComponentProps<"span"> & {
  tone?: FlowTone;
  busy?: boolean;
  children: ReactNode;
}) {
  const Icon = busy ? LoaderCircle : icons[tone];
  return (
    <span {...props} className={cn("flow-status", className)} data-tone={tone}>
      <Icon
        size={14}
        strokeWidth={1.75}
        aria-hidden
        className={busy ? "flow-spinner" : undefined}
      />
      <span>{children}</span>
    </span>
  );
}

export function FlowButton({
  variant = "secondary",
  className,
  ...props
}: ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <button
      type="button"
      {...props}
      className={cn("flow-button", className)}
      data-variant={variant}
    />
  );
}

export function FlowIconButton({
  label,
  children,
  ...props
}: Omit<ComponentProps<typeof FlowButton>, "children"> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip.Provider delayDuration={120}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <FlowButton
            {...props}
            aria-label={label}
            className={cn("flow-icon-button", props.className)}
          >
            {children}
          </FlowButton>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <div className="funnel flow-portal-scope">
            <Tooltip.Content sideOffset={8} className="flow-tooltip">
              {label}
            </Tooltip.Content>
          </div>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

export function FlowConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  children,
  theme,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  children: ReactElement;
  theme?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <div className="funnel flow-portal-scope" data-tema={theme}>
          <Dialog.Overlay className="funnel__overlay">
            <Dialog.Content className="funnel__dialog flow-confirm-dialog">
              <div className="funnel__dialog-body">
                <Dialog.Title>{title}</Dialog.Title>
                <Dialog.Description>{description}</Dialog.Description>
                <footer>
                  <Dialog.Close asChild>
                    <FlowButton>Cancelar</FlowButton>
                  </Dialog.Close>
                  <FlowButton
                    variant="danger"
                    onClick={() => {
                      onConfirm();
                      setOpen(false);
                    }}
                  >
                    {confirmLabel}
                  </FlowButton>
                </footer>
              </div>
            </Dialog.Content>
          </Dialog.Overlay>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function FlowField({
  id,
  label,
  help,
  error,
  ...props
}: ComponentProps<"input"> & {
  id: string;
  label: string;
  help?: string;
  error?: string;
}) {
  const description =
    [help && `${id}-help`, error && `${id}-error`, props["aria-describedby"]]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="flow-field">
      <label htmlFor={id}>{label}</label>
      <input
        {...props}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={description}
      />
      {help && <small id={`${id}-help`}>{help}</small>}
      {error && (
        <small id={`${id}-error`} className="flow-field-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}

export function FlowSelect({
  id,
  label,
  help,
  children,
  ...props
}: ComponentProps<"select"> & { id: string; label: string; help?: string }) {
  return (
    <div className="flow-field">
      <label htmlFor={id}>{label}</label>
      <select
        {...props}
        id={id}
        aria-describedby={
          [help && `${id}-help`, props["aria-describedby"]]
            .filter(Boolean)
            .join(" ") || undefined
        }
      >
        {children}
      </select>
      {help && <small id={`${id}-help`}>{help}</small>}
    </div>
  );
}
