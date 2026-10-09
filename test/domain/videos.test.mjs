import assert from "node:assert/strict";
import test from "node:test";

import {
  recentVideos,
  thumbnailUrl,
  videoList,
  watchUrl,
  youtubeId,
} from "../../src/domain/videos.ts";

const ID = "dQw4w9WgXcQ";
const row = (o) => ({ video: ID, title: "A video", ...o });

test("a bare id is taken as-is", () => {
  assert.equal(youtubeId(ID), ID);
  assert.equal(youtubeId(`  ${ID}  `), ID);
});

test("the id is pulled out of whatever they paste", () => {
  const pasted = [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&t=42s`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abcdef`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://m.youtube.com/watch?app=desktop&v=${ID}`,
  ];
  for (const url of pasted) assert.equal(youtubeId(url), ID, url);
});

test("anything without an id is refused rather than guessed", () => {
  assert.equal(youtubeId(""), null);
  assert.equal(youtubeId(undefined), null);
  assert.equal(youtubeId("not a video"), null);
  assert.equal(youtubeId("https://www.youtube.com/"), null);
  // Ten characters: close enough to be a typo, not close enough to use.
  assert.equal(youtubeId("dQw4w9WgXc"), null);
});

test("a row with no usable video or no title is dropped", () => {
  assert.deepEqual(videoList([row({ video: "nonsense" })]), []);
  assert.deepEqual(videoList([row({ title: "  " })]), []);
  assert.deepEqual(videoList(undefined), []);
});

test("newest first, undated rows last", () => {
  const titles = videoList([
    row({ title: "Older", posted: "2026-08-01" }),
    row({ title: "Undated" }),
    row({ title: "Newest", posted: "2026-10-01" }),
  ]).map((v) => v.title);
  assert.deepEqual(titles, ["Newest", "Older", "Undated"]);
});

test("the front page takes the featured ones when there are any", () => {
  const titles = recentVideos([
    row({ title: "Plain", posted: "2026-10-05" }),
    row({ title: "Picked", posted: "2026-08-01", featured: "yes" }),
  ]).map((v) => v.title);
  assert.deepEqual(titles, ["Picked"]);
});

test("with nothing featured it falls back to the newest, capped", () => {
  const rows = Array.from({ length: 8 }, (_, i) =>
    row({ title: `Video ${i}`, posted: `2026-10-0${i + 1}` }),
  );
  const picked = recentVideos(rows);
  assert.equal(picked.length, 3);
  assert.equal(picked[0].title, "Video 7");
});

test("urls are built from the id, not from what was pasted", () => {
  assert.equal(thumbnailUrl(ID), `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  assert.equal(watchUrl(ID), `https://www.youtube.com/watch?v=${ID}`);
});
