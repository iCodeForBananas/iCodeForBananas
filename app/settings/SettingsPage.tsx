"use client";

import React from "react";
export default function SettingsPage() {
  return (
    <div className='flex flex-col flex-1'>
      <main className='pr-4 py-4 flex-1 '>
        <div className='rounded-none border-none bg-black p-6'>
          <h2 className='text-lg font-medium mb-3 text-yellow-400'>Settings</h2>
          <p className='text-sm text-white/60'>Application settings will appear here.</p>
        </div>
      </main>
    </div>
  );
}
