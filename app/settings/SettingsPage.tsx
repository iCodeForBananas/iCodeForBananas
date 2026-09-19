"use client";

import { Text } from "@radix-ui/themes";
import BentoPageLayout from "../components/BentoPageLayout";
import { Bento } from "../components/ui/bento";

export default function SettingsPage() {
  return (
    <BentoPageLayout title='Settings'>
      <Bento>
        <Text size='2' color='gray'>
          Application settings will appear here.
        </Text>
      </Bento>
    </BentoPageLayout>
  );
}
