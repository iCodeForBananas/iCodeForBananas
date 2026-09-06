"use client";

import React from "react";
export default function SettingsPage() {
  return (
    <div className='flex flex-col flex-1'>
      <main className='pr-4 py-4 flex-1 '>
        <div className='rounded-none border-none bg-surface-base p-6'>
          <h2 className='mb-3 font-display text-20 font-semibold text-ink-primary'>Settings</h2>
          <p className='text-13 text-ink-muted'>Application settings will appear here.</p>
        </div>
      </main>
    </div>
  );
}
