"use client";

import React from "react";
import Navigation from "../components/Navigation";

export default function SettingsPage() {
  return (
    <div className='flex flex-col flex-1'>
      <Navigation />
      <main className='px-4 py-6 w-full lg:max-w-3xl lg:mx-auto flex-1 metronome-static'>
        <section className='mb-8'>
          <div className='rounded-lg border border-border bg-white p-8 shadow-sm'>
            <h2 className='text-lg font-medium mb-3'>Settings</h2>
            <p className='text-sm text-muted'>Application settings will appear here.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
