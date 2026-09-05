"use client";

import { Check, Globe, Link2, Lock } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Menu, MenuContent, MenuGroup, MenuItem, MenuTrigger } from "@/app/components/ui/menu";
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
    <Menu>
      <MenuTrigger
        render={
          <Button variant='secondary' size='sm' disabled={disabled} data-testid='visibility'>
            <Icon className='size-3.5' />
            {current?.label}
          </Button>
        }
      />
      <MenuContent className='min-w-72'>
        <MenuGroup label='Who can see this'>
          {VISIBILITIES.map((option) => (
            <MenuItem key={option.value} onClick={() => onChange(option.value)}>
              <span className='flex-1'>
                <span className='block text-ink-primary'>{option.label}</span>
                <span className='block text-12 text-ink-muted'>{option.help}</span>
              </span>
              {option.value === value && <Check className='size-4' />}
            </MenuItem>
          ))}
        </MenuGroup>
      </MenuContent>
    </Menu>
  );
}
