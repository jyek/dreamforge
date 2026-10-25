export const guidanceCategories: Record<
  string,
  { label: string; tip: string }
> = {
  bad_language: {
    label: "Bad language",
    tip: "Help the student use respectful words when asking for changes.",
  },
  not_specific: {
    label: "Not specific enough",
    tip: "Ask what should change, where it should change, and what the result should look like.",
  },
  bullying: {
    label: "Bullying",
    tip: "Discuss kindness and redirect the idea to a respectful project.",
  },
  hate: {
    label: "Hateful language",
    tip: "Discuss inclusive language and respectful treatment of others.",
  },
  privacy: {
    label: "Personal information",
    tip: "Use fictional names and avoid sharing personal details.",
  },
  self_harm: {
    label: "Wellbeing concern",
    tip: "Check in with the student privately and follow your school's safeguarding process.",
  },
  violence: {
    label: "Harmful content",
    tip: "Guide the student toward a safe, age-appropriate idea.",
  },
  sexual_minors: {
    label: "Inappropriate content",
    tip: "Follow your school's safeguarding process and redirect to an appropriate project.",
  },
  prompt_manipulation: {
    label: "Bypassing safety",
    tip: "Explain why the safety rules exist and help rephrase the request.",
  },
  malicious_code: {
    label: "Unsafe code",
    tip: "Discuss responsible coding and choose a safe alternative.",
  },
};
// Coaching hints are separate from moderation decisions. Short, precise commands
// such as “Make the button blue” must not be flagged just for being short.
export const guidanceSQL = `array(select distinct category from unnest(
  coalesce(r.categories, array[]::text[]) ||
  case when r.content ~* '\\m(fuck|fucking|shit|bullshit|bitch|asshole)\\M' then array['bad_language'] else array[]::text[] end ||
  case when trim(r.content) ~* '^(please[[:space:]]+)?(help|fix([[:space:]]+it)?|make([[:space:]]+it)?[[:space:]]+better|do([[:space:]]+it)?|change([[:space:]]+it)?|it[[:space:]]+(doesn''t|does not)[[:space:]]+work|not[[:space:]]+working)[.!?[:space:]]*$' then array['not_specific'] else array[]::text[] end ||
  case when r.decision <> 'allow' and cardinality(coalesce(r.categories,array[]::text[]))=0 then array['other_safety'] else array[]::text[] end
) as category)`;
export function guidanceLabel(category: string) {
  return (
    guidanceCategories[category]?.label ||
    (category === "other_safety"
      ? "Safety concern"
      : category.replaceAll("_", " "))
  );
}
