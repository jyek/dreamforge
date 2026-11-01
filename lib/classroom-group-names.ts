export const MAX_CLASSROOM_GROUPS = 20;
const natureAndAnimals = [
  "Foxes",
  "Owls",
  "Bears",
  "Deer",
  "Rabbits",
  "Otters",
  "Pandas",
  "Koalas",
  "Tigers",
  "Lions",
  "Dolphins",
  "Turtles",
  "Penguins",
  "Eagles",
  "Robins",
  "Butterflies",
  "Bees",
  "Squirrels",
  "Hedgehogs",
  "Wolves",
  "Willows",
  "Oaks",
  "Maples",
  "Ferns",
  "Daisies",
  "Sunflowers",
  "Rivers",
  "Mountains",
  "Forests",
  "Meadows",
];
export function classroomGroupNames(
  count: number,
  existing: string[] = [],
  random = Math.random,
) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_CLASSROOM_GROUPS)
    throw Error(`Choose between 1 and ${MAX_CLASSROOM_GROUPS} groups.`);
  const category = "Nature & Animals";
  const names = [...natureAndAnimals];
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
