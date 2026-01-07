"use client";

import React from "react";
import { useTheme } from "../lib/ThemeContext";
import Navigation from '../components/Navigation';

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className='flex flex-col flex-1'>
      <Navigation />
      <main className='px-4 py-6 w-full lg:max-w-3xl lg:mx-auto flex-1'>
      <section className='mb-8'>
        <div className='rounded-lg border border-border bg-white p-8 shadow-sm'>
          <h2 className='text-lg font-medium mb-3'>Theme</h2>
          <div className='flex flex-col gap-2'>
            <label className='text-sm text-muted'>Mode</label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className='w-full border border-border rounded px-2 py-1 text-sm bg-transparent text-foreground'
            >
              <option value='light'>Light</option>
              <option value='dark'>Dark</option>
            </select>
          </div>
        </div>
      </section>
    </main>
    </div>
  );
}
