import { Directory, File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import { workspaceDb, type DraftPage } from "./workspace";
export async function splitPage(page: DraftPage, uris: string[]) {
  if (uris.length !== 2) throw new Error("Expected two pages");
  const db = await workspaceDb();
  const dir = new Directory(Paths.document, "ScanDoc", "Drafts");
  const replacements = uris.map(() => ({
    id: Crypto.randomUUID(),
    path: `${Crypto.randomUUID()}.jpg`,
  }));
  try {
    // copy() is asynchronous natively; both halves must exist before the
    // rows below point at them, so this is a sequential loop, not a forEach.
    for (let i = 0; i < uris.length; i++)
      await new File(uris[i]).copy(new File(dir, replacements[i].path));
    await db.withExclusiveTransactionAsync(async (tx) => {
      const current = await tx.getFirstAsync<DraftPage>(
        "SELECT * FROM draft_pages WHERE id=?",
        page.id,
      );
      if (!current) throw new Error("Page missing");
      await tx.runAsync(
        "UPDATE draft_pages SET position=position+1 WHERE draftId=? AND position>?",
        page.draftId,
        current.position,
      );
      await tx.runAsync("DELETE FROM draft_pages WHERE id=?", page.id);
      for (let i = 0; i < 2; i++)
        await tx.runAsync(
          "INSERT INTO draft_pages VALUES(?,?,?,?)",
          replacements[i].id,
          page.draftId,
          replacements[i].path,
          current.position + i,
        );
    });
  } catch (error) {
    for (const next of replacements) {
      const file = new File(dir, next.path);
      if (file.exists) file.delete();
    }
    throw error;
  }
  try {
    new File(dir, page.path).delete();
  } catch {}
}
