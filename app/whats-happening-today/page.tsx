"use client";

import { useState } from "react";
import { WhatsHappeningEvent } from "../components/WhatsHappeningTypes";
import WhatsHappeningListView from "../components/WhatsHappeningListView";
import WhatsHappeningMapView from "../components/WhatsHappeningMapView";

const TODAY_EVENTS: WhatsHappeningEvent[] = [
  {
    id: "1",
    name: "Seattle Jazz Collective",
    venue: "The Triple Door",
    address: "216 Union St, Seattle, WA 98101",
    time: "7:30 PM",
    price: 20,
    category: "Live Music",
    description: "The Seattle Jazz Collective returns for an intimate evening of bebop and swing classics. Featuring a rotating lineup of the Pacific Northwest's top jazz musicians. Cocktails and dinner service available throughout the show.",
    lat: 47.6069,
    lng: -122.3376,
    imageEmoji: "🎷",
  },
  {
    id: "2",
    name: "Pike Place Farmers Market",
    venue: "Pike Place Market",
    address: "85 Pike St, Seattle, WA 98101",
    time: "9:00 AM",
    price: null,
    category: "Food & Drink",
    description: "Browse hundreds of local vendors offering fresh produce, artisan foods, flowers, and handmade goods. Live buskers perform throughout the market. A beloved Seattle tradition since 1907.",
    lat: 47.6091,
    lng: -122.3421,
    imageEmoji: "🥕",
  },
  {
    id: "3",
    name: "Emerald City Comedy Night",
    venue: "Laughs Comedy Club",
    address: "12099 NE 1st St, Bellevue, WA 98005",
    time: "8:00 PM",
    price: 18,
    category: "Comedy",
    description: "Five local and touring comedians take the stage for a night of laughs. This week's headliner brings fresh material from their recent national tour. Two-drink minimum.",
    lat: 47.6205,
    lng: -122.1947,
    imageEmoji: "🎤",
  },
  {
    id: "4",
    name: "SAM First Thursday",
    venue: "Seattle Art Museum",
    address: "1300 1st Ave, Seattle, WA 98101",
    time: "5:00 PM",
    price: null,
    category: "Art",
    description: "The Seattle Art Museum opens its doors for free on the first Thursday of every month. Explore rotating exhibitions and a permanent collection spanning thousands of years of human creativity. Live music in the atrium.",
    lat: 47.6072,
    lng: -122.3384,
    imageEmoji: "🎨",
  },
  {
    id: "5",
    name: "Mariners vs. Astros",
    venue: "T-Mobile Park",
    address: "1250 1st Ave S, Seattle, WA 98134",
    time: "6:40 PM",
    price: 35,
    category: "Sports",
    description: "The Seattle Mariners host the Houston Astros in this divisional matchup. Gates open at 5:10 PM. Bobblehead giveaway for the first 10,000 fans.",
    lat: 47.5914,
    lng: -122.3328,
    imageEmoji: "⚾",
  },
  {
    id: "6",
    name: "Capitol Hill Block Party Warm-Up",
    venue: "Neumos",
    address: "925 E Pike St, Seattle, WA 98122",
    time: "9:00 PM",
    price: 15,
    category: "Festival",
    description: "Kick off the summer festival season with this indie rock showcase featuring four up-and-coming Pacific Northwest bands. Doors open at 8 PM. All ages welcome until 10 PM.",
    lat: 47.6141,
    lng: -122.3205,
    imageEmoji: "🎸",
  },
  {
    id: "7",
    name: "Fremont Sunday Market",
    venue: "Fremont Arts District",
    address: "3401 Evanston Ave N, Seattle, WA 98103",
    time: "10:00 AM",
    price: null,
    category: "Art",
    description: "Seattle's beloved outdoor market featuring antiques, vintage items, crafts, and street food. Over 150 vendors gather every Sunday in the heart of the quirky Fremont neighborhood. Live performances throughout the day.",
    lat: 47.6508,
    lng: -122.3498,
    imageEmoji: "🛍️",
  },
  {
    id: "8",
    name: "Ramen & Sake Festival",
    venue: "Seattle Center Pavilion",
    address: "305 Harrison St, Seattle, WA 98109",
    time: "12:00 PM",
    price: 10,
    category: "Food & Drink",
    description: "Over a dozen of Seattle's top ramen chefs compete for the title of best bowl in the city. Sake tastings, Japanese street food, and cultural performances round out the afternoon. Proceeds benefit local food banks.",
    lat: 47.6209,
    lng: -122.3515,
    imageEmoji: "🍜",
  },
  {
    id: "9",
    name: "Sounders FC vs. Portland Timbers",
    venue: "Lumen Field",
    address: "800 Occidental Ave S, Seattle, WA 98134",
    time: "7:30 PM",
    price: 45,
    category: "Sports",
    description: "The Cascadia Cup rivalry heats up as the Seattle Sounders take on the Portland Timbers. One of MLS's most passionate derbies, this match is always a sellout. Arrive early for the pre-match supporter tifo display.",
    lat: 47.5952,
    lng: -122.3316,
    imageEmoji: "⚽",
  },
  {
    id: "10",
    name: "Outdoor Film: The Princess Bride",
    venue: "Cal Anderson Park",
    address: "1635 11th Ave, Seattle, WA 98122",
    time: "8:30 PM",
    price: null,
    category: "Festival",
    description: "Bring a blanket and enjoy this classic film under the stars in one of Capitol Hill's favorite parks. Food trucks on-site starting at 7 PM. This is an all-ages free community event.",
    lat: 47.6148,
    lng: -122.3190,
    imageEmoji: "🎬",
  },
];

type ViewMode = "list" | "map";

export default function WhatsHappeningTodayPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900">What&apos;s Happening Today?</h1>
        <p className="text-gray-500 mt-1">Events happening in your city today</p>

        {/* View toggle */}
        <div className="flex gap-1 mt-4 bg-gray-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setViewMode("list")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === "list"
                ? "bg-gradient-to-br from-pink-100 to-orange-100 text-gray-900 font-semibold shadow-sm"
                : "text-gray-600 hover:bg-gray-200"
            }`}
          >
            📋 List
          </button>
          <button
            onClick={() => setViewMode("map")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === "map"
                ? "bg-gradient-to-br from-pink-100 to-orange-100 text-gray-900 font-semibold shadow-sm"
                : "text-gray-600 hover:bg-gray-200"
            }`}
          >
            🗺️ Map
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {viewMode === "list" ? (
          <WhatsHappeningListView
            events={TODAY_EVENTS}
            selectedEventId={selectedEventId}
            onSelectEvent={setSelectedEventId}
          />
        ) : (
          <div className="p-4">
            <WhatsHappeningMapView events={TODAY_EVENTS} />
          </div>
        )}
      </div>
    </div>
  );
}
