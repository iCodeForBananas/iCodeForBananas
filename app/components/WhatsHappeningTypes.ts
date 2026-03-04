export interface WhatsHappeningEvent {
  id: string;
  name: string;
  venue: string;
  address: string;
  time: string;
  date: string | null;
  price: number | null;
  category: string;
  description: string;
  lat: number;
  lng: number;
  source?: string;
  eventUrl?: string | null;
}
