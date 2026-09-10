import { evaluate } from '../lib/expr.js';
import { round2 } from '../lib/format.js';

/** Fuel, nights, dogs. Formula-driven so a gas-price refresh propagates everywhere. */
export function computeRoadTrip(project) {
  const s = project.scope;
  const effectiveMiles = round2(s['roadtrip.route_miles'] * (1 + s['roadtrip.detour_buffer']));
  const gallons = round2(effectiveMiles / s['roadtrip.tundra_mpg']);
  const items = project.budget.items
    .filter((item) => item.workstream === 'road_trip')
    .map((item) => ({ id: item.id, label: item.label, amount: round2(evaluate(item.formula, project.scope)), timing: item.timing }));
  const total = round2(items.reduce((sum, item) => sum + item.amount, 0));

  return {
    base_miles: s['roadtrip.route_miles'],
    detour_buffer: s['roadtrip.detour_buffer'],
    effective_miles: effectiveMiles,
    mpg: s['roadtrip.tundra_mpg'],
    gallons,
    gas_price: s['roadtrip.gas_price'],
    travel_days: s['roadtrip.travel_days'],
    hotel_nights: s['roadtrip.hotel_nights'],
    items,
    total,
    driving_load: {
      miles_per_travel_day: round2(effectiveMiles / s['roadtrip.travel_days']),
      note: 'Target 6-8 driving hours per day with a dog stop roughly every two hours. If miles per day pushes past ~500, add a day rather than a longer day.',
    },
    route_skeleton: project.roadtrip.route_skeleton,
    route_status: project.roadtrip.route_skeleton_status,
  };
}
