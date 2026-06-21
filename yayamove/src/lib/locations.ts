/** Metro Manila cities with centroid coordinates + sample barangays.
 *  Centroids power the "filter by city" distance sorting without needing a map
 *  API (cost-free). Extend with the full PSGC list when you go nationwide. */
export interface City {
  name: string;
  lat: number;
  lng: number;
  barangays: string[];
}

export const NCR_CITIES: City[] = [
  { name: "Quezon City", lat: 14.676, lng: 121.0437, barangays: ["Diliman", "Cubao", "Fairview", "Novaliches", "Commonwealth"] },
  { name: "Manila", lat: 14.5995, lng: 120.9842, barangays: ["Ermita", "Malate", "Tondo", "Sampaloc", "Binondo"] },
  { name: "Makati City", lat: 14.5547, lng: 121.0244, barangays: ["Poblacion", "Bel-Air", "San Lorenzo", "Guadalupe", "Pio del Pilar"] },
  { name: "Pasig City", lat: 14.5764, lng: 121.0851, barangays: ["Kapitolyo", "Ortigas", "San Antonio", "Ugong", "Maybunga"] },
  { name: "Taguig City", lat: 14.5176, lng: 121.0509, barangays: ["Western Bicutan", "BGC", "Ususan", "Signal Village", "Pinagsama"] },
  { name: "Mandaluyong", lat: 14.5794, lng: 121.0359, barangays: ["Plainview", "Highway Hills", "Wack-Wack", "Addition Hills"] },
  { name: "Parañaque", lat: 14.4793, lng: 121.0198, barangays: ["BF Homes", "Don Bosco", "San Antonio", "Sun Valley"] },
  { name: "Pasay City", lat: 14.5378, lng: 121.0014, barangays: ["Malibay", "San Rafael", "Maricaban"] },
  { name: "San Juan", lat: 14.6019, lng: 121.0355, barangays: ["Greenhills", "Salapan", "Little Baguio"] },
  { name: "Las Piñas", lat: 14.4499, lng: 120.9833, barangays: ["Almanza", "Pamplona", "Talon"] },
  { name: "Muntinlupa", lat: 14.4081, lng: 121.0415, barangays: ["Alabang", "Poblacion", "Tunasan"] },
  { name: "Marikina", lat: 14.6507, lng: 121.1029, barangays: ["Sto. Niño", "Concepcion", "Marikina Heights"] },
  { name: "Caloocan", lat: 14.6499, lng: 120.9809, barangays: ["Bagong Silang", "Grace Park", "Sangandaan"] },
];

export const CITY_BY_NAME = Object.fromEntries(
  NCR_CITIES.map((c) => [c.name, c]),
) as Record<string, City>;

/** Default map centre (roughly Metro Manila) when the user hasn't shared location. */
export const NCR_CENTER = { lat: 14.5764, lng: 121.0351 };
