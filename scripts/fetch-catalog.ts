/**
 * Fetch the full episode catalog of "Í ljósi sögunnar" from RÚV's GraphQL API
 * and write data/catalog.json. Safe to re-run at any time; annotations live in
 * a separate file and are never touched.
 */
import { writeFileSync, mkdirSync } from "node:fs";

const GQL = "https://spilari.nyr.ruv.is/gql/";
const PROGRAM_ID = 23795;

interface RawEpisode {
  id: string;
  title: string;
  description: string;
  firstrun: string;
  duration: number | null;
  file: string | null;
  image: string | null;
}

const query = `
  query ($id: Int!, $limit: Int!) {
    Program(id: $id) {
      title
      episodes(limit: $limit) {
        id
        title
        description
        firstrun
        duration
        file
        image
      }
    }
  }
`;

const res = await fetch(GQL, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ query, variables: { id: PROGRAM_ID, limit: 2000 } }),
});
if (!res.ok) throw new Error(`GraphQL request failed: ${res.status}`);
const body = (await res.json()) as {
  errors?: { message: string }[];
  data?: { Program: { title: string; episodes: RawEpisode[] } };
};
if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
if (!body.data?.Program) throw new Error("No Program in response");

const { title, episodes } = body.data.Program;

const catalog = {
  fetched: new Date().toISOString(),
  program: PROGRAM_ID,
  programTitle: title,
  episodes: episodes
    .map((e) => ({
      id: e.id,
      title: e.title.trim(),
      description: e.description.trim(),
      firstrun: e.firstrun.slice(0, 10),
      durationSec: e.duration,
      audio: e.file,
      image: e.image,
    }))
    .sort((a, b) => a.firstrun.localeCompare(b.firstrun) || a.id.localeCompare(b.id)),
};

mkdirSync("data", { recursive: true });
writeFileSync("data/catalog.json", JSON.stringify(catalog, null, 1) + "\n");
console.log(`Wrote data/catalog.json: ${catalog.episodes.length} episodes`);
console.log(`  oldest: ${catalog.episodes[0].firstrun} ${catalog.episodes[0].title}`);
console.log(`  newest: ${catalog.episodes.at(-1)!.firstrun} ${catalog.episodes.at(-1)!.title}`);
const missing = catalog.episodes.filter((e) => !e.audio);
if (missing.length) console.warn(`  WARNING: ${missing.length} episodes without audio URL`);
