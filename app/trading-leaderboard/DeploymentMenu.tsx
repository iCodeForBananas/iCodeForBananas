"use client";

// A leaderboard row's actions menu: open the deployment's details, pause or
// resume it, or delete it (which closes its position at market first). The
// writes are the panel's own (useDeploymentActions), so the two always agree.

import { useState } from "react";
import { AlertDialog, DropdownMenu, Flex } from "@radix-ui/themes";
import { LineChart, MoreHorizontal, Pause, Play, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import type { DeploymentConfig } from "@/app/lib/deploymentDetails";
import { useDeploymentActions, type DeploymentControlsProps } from "./DeploymentControls";

export interface DeploymentMenuProps {
  id: string;
  label: string;
  config: DeploymentConfig | undefined;
  onChange: DeploymentControlsProps["onChange"];
  onOpenDetails: () => void;
}

export function DeploymentMenu({ id, label, config, onChange, onOpenDetails }: DeploymentMenuProps) {
  const { busy, error, clearError, setEnabled, remove } = useDeploymentActions(id, config, onChange);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <Button variant="ghost" size="icon-sm" disabled={busy} aria-label={`Actions for ${label}`}>
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" className="min-w-56">
          <DropdownMenu.Label>{label}</DropdownMenu.Label>
          <DropdownMenu.Item onSelect={onOpenDetails}>
            <LineChart className="size-3.5" aria-hidden />
            Details and equity curve
          </DropdownMenu.Item>
          {config && (
            <>
              <DropdownMenu.Separator />
              {config.tearingDown ? (
                <DropdownMenu.Item onSelect={() => void setEnabled(true)}>
                  <Undo2 className="size-3.5" aria-hidden />
                  Cancel the delete and resume
                </DropdownMenu.Item>
              ) : config.enabled ? (
                <DropdownMenu.Item onSelect={() => void setEnabled(false)}>
                  <Pause className="size-3.5" aria-hidden />
                  Pause (keeps the position open)
                </DropdownMenu.Item>
              ) : (
                <DropdownMenu.Item onSelect={() => void setEnabled(true)}>
                  <Play className="size-3.5" aria-hidden />
                  Resume
                </DropdownMenu.Item>
              )}
              {!config.tearingDown && (
                <DropdownMenu.Item color="red" onSelect={() => setConfirmDelete(true)}>
                  <Trash2 className="size-3.5" aria-hidden />
                  Close position and delete…
                </DropdownMenu.Item>
              )}
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      <AlertDialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialog.Content maxWidth="440px">
          <AlertDialog.Title>Delete {label}?</AlertDialog.Title>
          <AlertDialog.Description size="2">
            It stops trading now. Its position is closed at market on the dispatcher&apos;s next run (at the next open if the market is shut),
            then the deployment is removed. Until it is flat you can still cancel from this menu.
          </AlertDialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="ghost">Keep it</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button variant="danger" onClick={() => void remove()}>
                <Trash2 className="size-3.5" aria-hidden />
                Close position and delete
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>

      <AlertDialog.Root open={error !== null} onOpenChange={(open) => !open && clearError()}>
        <AlertDialog.Content maxWidth="440px">
          <AlertDialog.Title>That didn&apos;t go through</AlertDialog.Title>
          <AlertDialog.Description size="2">{error}</AlertDialog.Description>
          <Flex mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="secondary">OK</Button>
            </AlertDialog.Cancel>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </>
  );
}
