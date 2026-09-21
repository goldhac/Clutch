import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local", quiet: true });
/**
 * test-delete-series.ts — deleting a series must not strand its audio (#2, #5).
 *   npx tsx scripts/test-delete-series.ts        (needs SUPABASE_SERVICE_ROLE_KEY)
 *
 * Found while building the schema: Supabase blocks DELETE on storage.objects from SQL, so a
 * database cascade can NEVER remove audio. Delete the rows first and every MP3 is orphaned with
 * nothing left pointing at it. This proves the order: objects through the Storage API, then rows.
 *
 * It writes real rows and real objects, then removes them. Everything it creates, it cleans up.
 */
import assert from "node:assert/strict";
import { deleteSeries, audioKey, previewKey, BUCKET } from "@/worker/episode-store";
import { hasServiceKey, serviceClient } from "@/lib/supabase/service";

const USER = "ecfbaca9-7b0a-4994-a348-1aecfbb93726";

if (!hasServiceKey()) {
  console.log("skipped: SUPABASE_SERVICE_ROLE_KEY is not set (see src/lib/supabase/service.ts)");
  process.exit(0);
}

(async () => {
  const db = serviceClient();
  const { data: series, error: sErr } = await db
    .from("podcast_series").insert({ user_id: USER, title: "delete probe" }).select("id").single();
  assert.ok(!sErr, `could not create the probe series: ${sErr?.message}`);
  const seriesId = series!.id as string;

  try {
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const { data, error } = await db.from("podcasts")
        .insert({ series_id: seriesId, user_id: USER, topic: `probe ${i}`, topic_index: i, credits_spent: 1 })
        .select("id").single();
      assert.ok(!error, `could not create a probe episode: ${error?.message}`);
      ids.push(data!.id as string);
    }
    // Real objects in the real bucket.
    for (const id of ids) {
      for (const key of [audioKey(USER, id), previewKey(USER, id)]) {
        const { error } = await db.storage.from(BUCKET).upload(key, new Uint8Array([1, 2, 3]), { contentType: "audio/mpeg", upsert: true });
        assert.ok(!error, `could not upload ${key}: ${error?.message}`);
      }
    }
    const before = await db.storage.from(BUCKET).list(USER);
    const mine = (before.data ?? []).filter((o) => ids.some((id) => o.name.startsWith(id)));
    assert.equal(mine.length, 4, `expected 4 objects before deleting, found ${mine.length}`);
    console.log(`  ok  4 audio objects exist before the delete`);

    const { objectsRemoved } = await deleteSeries(db, USER, seriesId);
    assert.equal(objectsRemoved, 4, `expected 4 objects removed, got ${objectsRemoved}`);
    console.log(`  ok  deleteSeries removed all 4 through the Storage API`);

    const after = await db.storage.from(BUCKET).list(USER);
    const left = (after.data ?? []).filter((o) => ids.some((id) => o.name.startsWith(id)));
    assert.equal(left.length, 0, `${left.length} object(s) were orphaned in the bucket`);
    console.log(`  ok  nothing is left in the bucket`);

    const { data: rows } = await db.from("podcasts").select("id").eq("series_id", seriesId);
    assert.equal((rows ?? []).length, 0, "the episodes must go with the series");
    const { data: s2 } = await db.from("podcast_series").select("id").eq("id", seriesId);
    assert.equal((s2 ?? []).length, 0, "the series row must be gone");
    console.log(`  ok  the rows are gone too, by cascade`);

    console.log("\n4 checks passed");
  } finally {
    // Whatever happened, do not leave a probe series behind.
    await db.from("podcast_series").delete().eq("id", seriesId);
  }
})().catch((e) => { console.error(e); process.exit(1); });
