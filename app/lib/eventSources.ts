// Add URLs here to scrape for events on the "What's Happening Today" page.
// Each entry can optionally include a label for debugging/logging purposes.

export interface EventSource {
  url: string;
  label: string;
  lat?: number;
  lng?: number;
  googleCalendarId?: string;
}

export const EVENT_SOURCES: EventSource[] = [
  // Example entries — replace or add your own:
  {
    url: 'https://www.jazzalley.com/www-home/',
    label: "Dimitriou's Jazz Alley",
    lat: 47.61491692500653,
    lng: -122.33962773213206,
  },
  {
    url: 'https://www.ballardjamhouse.com/schedule.html',
    label: "Egan's Ballard Jam House",
    lat: 47.6686180959829,
    lng: -122.37922450329386,
  },
  {
    url: 'https://www.elcorazonseattle.com/',
    label: 'El Corazon The Funhouse',
    lat: 47.61873402919436,
    lng: -122.32929820877767,
  },
  {
    url: 'https://www.thebluemoonseattle.com/calendar',
    label: 'The Blue Moon Tavern',
    lat: 47.661455862049365,
    lng: -122.31998940432884,
    googleCalendarId: 'k3bcrptn7frodqrcbe093i3s4o@group.calendar.google.com',
  },
];
