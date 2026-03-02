// Add URLs here to scrape for events on the "What's Happening Today" page.
// Each entry can optionally include a label for debugging/logging purposes.

export interface EventSource {
  url: string;
  label: string;
}

export const EVENT_SOURCES: EventSource[] = [
  // Example entries — replace or add your own:
  // { url: "https://www.seattle.gov/events", label: "Seattle.gov Events" },
  // { url: "https://www.eventbrite.com/d/wa--seattle/events--today/", label: "Eventbrite Seattle" },
];
