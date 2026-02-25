export interface WhatsHappeningEvent {
  id: string;
  name: string;
  venue: string;
  address: string;
  time: string;
  price: number | null;
  category: string;
  description: string;
  lat: number;
  lng: number;
  imageEmoji: string;
}
