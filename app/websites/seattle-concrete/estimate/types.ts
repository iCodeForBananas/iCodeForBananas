export interface PavingData {
  areaSqFt: number;
  depthInches: number;
  density: number;
  materialType: string;
  tonnage: number;
  projectName: string;
  clientName: string;
  address: string;
  mapScreenshot?: string;
  mockupImage?: string;
}

export const MATERIALS = [
  { name: "Asphalt", density: 145 },
  { name: "Concrete", density: 150 },
  { name: "Stone/Gravel", density: 105 },
];

export const DEFAULT_DATA: PavingData = {
  areaSqFt: 0,
  depthInches: 3,
  density: 145,
  materialType: "Asphalt",
  tonnage: 0,
  projectName: "New Driveway Project",
  clientName: "",
  address: "",
};
