"use client";

import { Check, Globe, Link2, Lock } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { DropdownMenu } from "@radix-ui/themes";
import { VISIBILITIES, type Visibility } from "./sharing";

const ICONS = {
  private: Lock,
  unlisted: Link2,
  public: Globe,
} as const;

/**
 * Who can see this song. Each option says what it means in words rather than
 * relying on the icon, because the difference between unlisted and public is
 * exactly the thing people get wrong.
 */
export function VisibilityPicker({
  value,
  onChange,
  disabled,
}: {
  value: Visibility;
  onChange: (next: Visibility) => void;
  disabled?: boolean;
}) {
  const Icon = ICONS[value];
  const current = VISIBILITIES.find((v) => v.value === value);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <Button variant='secondary' size='sm' disabled={disabled} data-testid='visibility'>
          <Icon className='size-3.5' />
          {current?.label}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align='start' className='min-w-72'>
        <DropdownMenu.Label>Who can see this</DropdownMenu.Label>
        {VISIBILITIES.map((option) => (
          <DropdownMenu.Item key={option.value} onSelect={() => onChange(option.value)} className='h-auto py-1.5'>
            <span className='flex-1'>
              <span className='block'>{option.label}</span>
              <span className='block text-12 opacity-70'>{option.help}</span>
            </span>
            {option.value === value && <Check className='size-4' />}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
