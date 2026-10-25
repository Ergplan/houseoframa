// The welcome building: how many buildings the product's plan has. The builder replaces this building
// with the product's own; it is here so the scaffold shows one traced figure from the first lift.
import plan from '../../.rama/features.json';

export interface Building {
  id: string;
  name: string;
  does: string;
  screens: string[];
}

/** The buildings on the plan, as .rama/features.json lists them. */
export function planned(): Building[] {
  return plan.features;
}

/** How many buildings the plan has. */
export function buildingCount(buildings: Building[]): number {
  return buildings.length;
}
