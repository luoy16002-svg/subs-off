import type { LearnerInput } from "./types";

export interface SampleLearner {
  id: string;
  blurb: string;
  input: LearnerInput;
}

// Four ready-made learners so a first visit starts with one click.
export const SAMPLE_LEARNERS: SampleLearner[] = [
  {
    id: "maya",
    blurb: "Lives in Chicago. Wants Spanish she would watch anyway.",
    input: {
      name: "Maya",
      language: "es",
      level: "intermediate",
      targetCity: "mexico-city",
      homeCity: "Chicago",
      minutesPerDay: 30,
      favorites: [
        { name: "Severance", kind: "tv_show" },
        { name: "Phoebe Bridgers", kind: "artist" },
        { name: "Normal People", kind: "book" },
        { name: "Fleabag", kind: "tv_show" },
      ],
    },
  },
  {
    id: "leo",
    blurb: "Line cook in London. Starting Japanese from zero.",
    input: {
      name: "Leo",
      language: "ja",
      level: "beginner",
      targetCity: "tokyo",
      homeCity: "London",
      minutesPerDay: 25,
      favorites: [
        { name: "The Bear", kind: "tv_show" },
        { name: "Frank Ocean", kind: "artist" },
        { name: "Spirited Away", kind: "movie" },
        { name: "Kitchen Confidential", kind: "book" },
      ],
    },
  },
  {
    id: "priya",
    blurb: "Toronto. Learning Korean on the bus, 20 minutes a day.",
    input: {
      name: "Priya",
      language: "ko",
      level: "beginner",
      targetCity: "seoul",
      homeCity: "Toronto",
      minutesPerDay: 20,
      favorites: [
        { name: "The Great British Bake Off", kind: "tv_show" },
        { name: "Taylor Swift", kind: "artist" },
        { name: "Pride and Prejudice", kind: "book" },
        { name: "Gilmore Girls", kind: "tv_show" },
      ],
    },
  },
  {
    id: "sam",
    blurb: "New York. Fluent-ish French, wants it to stay sharp.",
    input: {
      name: "Sam",
      language: "fr",
      level: "advanced",
      targetCity: "paris",
      homeCity: "New York",
      minutesPerDay: 45,
      favorites: [
        { name: "Succession", kind: "tv_show" },
        { name: "Daft Punk", kind: "artist" },
        { name: "Murder on the Orient Express", kind: "book" },
        { name: "Knives Out", kind: "movie" },
      ],
    },
  },
];

export function sampleById(id: string): SampleLearner | undefined {
  return SAMPLE_LEARNERS.find((sample) => sample.id === id);
}
