import type { Section } from "../components/Prose";

/** `/about/rules`: what counts as a country (DATA_AND_CONTENT §6) and how scoring works (silhouette §6, quiz-library §6, fact-pin §6). */
export const COUNTRY_RULES: readonly Section[] = [
  {
    heading: "What counts as a country here",
    paragraphs: [
      "Every game uses one list by default: 197 sovereign countries. That is the 193 member states of the United Nations, plus the Vatican and Palestine (both UN observer states), plus Kosovo and Taiwan, the two places with the most recognition outside the UN.",
      "You can switch the quizzes to the 193 UN members only in Settings.",
      "We follow the lists and the borders of public datasets and say plainly where a border or a status is disputed. Showing a place on the map, or accepting it as an answer, is not a political statement about it.",
    ],
  },
  {
    heading: "Parts of countries and territories",
    bullets: [
      "Overseas regions such as French Guiana, Réunion, Guadeloupe, Martinique and Mayotte belong to their country. They are not separate answers, and typing one tells you which country it is part of.",
      "England, Scotland, Wales and Northern Ireland are parts of the United Kingdom, not separate countries in these games.",
      "Dependent territories such as Greenland, Puerto Rico or Hong Kong are not in the default list. A set that includes them is planned.",
      "Places with limited recognition outside the list, such as Northern Cyprus or Somaliland, are not asked in quizzes.",
    ],
  },
  {
    heading: "Disputed areas",
    paragraphs: [
      "Where a border is disputed we draw the boundary that is actually administered, and mark the area as disputed with a neutral note that says who administers it and who claims it. If you think something is wrong, use Report a problem on any result.",
    ],
  },
];

export const SCORING_RULES: readonly Section[] = [
  {
    heading: "How scoring works",
    paragraphs: ["Each game scores differently, and every score is shown with the reason for it."],
  },
  {
    heading: "Silhouette",
    bullets: [
      "You have six guesses. Solving in n guesses scores 7 − n points, so a first-try solve with no hints is 6.",
      "Each hint you open costs points (more on harder levels), but a solved round is always worth at least 1. A round you fail scores 0.",
      "Each correct capital or flag follow-up adds 1 point.",
      "Distances are measured between the centre of each country's largest landmass, so two countries that share a border can still be far apart; the border marker tells you when they touch.",
    ],
  },
  {
    heading: "Quiz Library",
    bullets: [
      "Naming every item: 1 point for each item you name, and half a point if a hint highlighted it first.",
      "Prompted answers: 1 point if correct, half a point if you used a hint, 0 if you revealed it.",
      "Click on the map: 1, then half, then a quarter of a point for the first, second and third attempt.",
      "Multiple choice: 1 point for a correct choice.",
      "Your score is the total divided by the number of items, shown as a percentage. Your personal best for each setup also counts the time used, and a faster run wins a tie.",
    ],
  },
  {
    heading: "Fact Pin",
    bullets: [
      "Each fact is worth up to 1,000 points. The closer your pin to the answer, the higher the score, and the scale depends on how precise the fact is: a building is judged more tightly than a continent.",
      "For a place, you lose nothing if you are inside its tolerance. For a country or region, any pin inside it scores the full 1,000.",
      "The continent hint caps that fact at 700 points, and the country hint at 400.",
      "A run of five facts has a total out of 5,000. 4,500 or more is Pinpoint, 3,500 is Sharp, 2,000 is On the map, and below that is Exploring.",
      "With a timer on, the pin you have placed is locked in when time runs out. No pin scores 0.",
    ],
  },
  {
    heading: "Daily puzzles",
    paragraphs: [
      "Daily puzzles are optional and the same for everyone on a given date. They are never required, and missing one costs you nothing.",
    ],
  },
];
