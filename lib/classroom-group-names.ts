export const MAX_CLASSROOM_GROUPS = 24;
const themes = {
  Elements: [
    "Neon",
    "Argon",
    "Helium",
    "Carbon",
    "Oxygen",
    "Silver",
    "Gold",
    "Copper",
    "Titanium",
    "Zinc",
    "Iron",
    "Cobalt",
    "Nickel",
    "Silicon",
    "Hydrogen",
    "Lithium",
    "Boron",
    "Sulfur",
    "Platinum",
    "Xenon",
    "Krypton",
    "Calcium",
    "Magnesium",
    "Sodium",
  ],
  Gemstones: [
    "Ruby",
    "Sapphire",
    "Emerald",
    "Opal",
    "Jade",
    "Topaz",
    "Amber",
    "Amethyst",
    "Quartz",
    "Garnet",
    "Onyx",
    "Pearl",
    "Diamond",
    "Agate",
    "Jasper",
    "Peridot",
    "Citrine",
    "Turquoise",
    "Aquamarine",
    "Moonstone",
    "Lapis",
    "Tourmaline",
    "Sunstone",
    "Zircon",
  ],
  Constellations: [
    "Orion",
    "Lyra",
    "Leo",
    "Draco",
    "Pegasus",
    "Cygnus",
    "Phoenix",
    "Andromeda",
    "Cassiopeia",
    "Perseus",
    "Aquila",
    "Vela",
    "Carina",
    "Hydra",
    "Lynx",
    "Lupus",
    "Dorado",
    "Pavo",
    "Columba",
    "Delphinus",
    "Lacerta",
    "Volans",
    "Tucana",
    "Crux",
  ],
};
export function classroomGroupNames(
  count: number,
  existing: string[] = [],
  random = Math.random,
) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_CLASSROOM_GROUPS)
    throw Error(`Choose between 1 and ${MAX_CLASSROOM_GROUPS} groups.`);
  const categories = Object.keys(themes) as (keyof typeof themes)[];
  const category = categories[Math.floor(random() * categories.length)];
  const names = [...themes[category]];
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  const used = new Set(existing.map((n) => n.toLowerCase()));
  return {
    category,
    names: names.slice(0, count).map((base) => {
      let name = base,
        suffix = 2;
      while (used.has(name.toLowerCase())) name = `${base} ${suffix++}`;
      used.add(name.toLowerCase());
      return name;
    }),
  };
}
