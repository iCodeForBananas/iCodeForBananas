"use client";

import React from "react";
export default function SettingsPage() {
  return (
    <div className='flex flex-col flex-1'>
      <main className='pr-4 py-4 flex-1 '>
        <div className='rounded-lg p-6 bg-white'>
          <h2 className='text-lg font-medium mb-3'>Settings</h2>
          <p className='text-sm text-muted'>Application settings will appear here.</p>
        </div>
      </main>
    </div>
  );
}
