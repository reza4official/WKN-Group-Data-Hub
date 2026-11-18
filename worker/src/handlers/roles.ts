import type { Env } from "../env";
import { assertLower, requirePerm, type Actor } from "../lib/actor";
import { auditWrite } from "../lib/audit";
import { commit, getDocument, queryDocuments } from "../lib/firestore";
import { HttpError, str, type Body } from "../lib/http";
import { changedPerms, isKnownPerm, isSubset } from "../lib/perms";
import type { ServiceAccount } from "../lib/serviceAccount";
import { conflictToHttp } from "./users";

interface Ctx {
  actor: Actor;
  env: Env;
  sa: ServiceAccount;
}

function readPerms(body: Body): string[] {
  const p = body.perms;
  if (!Array.isArray(p) || p.some((x) => typeof x !== "string"))
    throw new HttpError(400, "bad_request", "Daftar izin tidak valid.");
  const unique = [...new Set(p as string[])];
  const unknown = unique.filter((k) => !isKnownPerm(k));
  if (unknown.length)
    throw new HttpError(
      400,
      "bad_request",
      `Izin tidak dikenal: ${unknown.join(", ")}.`,
    );
  return unique;
}

export async function createRole(c: Ctx, body: Body): Promise<{ id: string }> {
  requirePerm(c.actor, "roles");
  const name = str(body, "name", { max: 80, label: "Nama role" });
  const level = body.level;
  if (typeof level !== "number" || !Number.isInteger(level) || level < 1)
    throw new HttpError(
      400,
      "bad_request",
      "Level harus bilangan bulat positif.",
    );
  if (!(level < c.actor.level))
    throw new HttpError(
      403,
      "forbidden",
      `Level role baru harus di bawah level Anda (maksimal ${c.actor.level - 1}).`,
    );
  const perms = readPerms(body);
  if (!isSubset(perms, c.actor.perms))
    throw new HttpError(
      403,
      "forbidden",
      "Anda tidak dapat memberi izin yang tidak Anda miliki.",
    );

  const roles = await queryDocuments(c.env, c.sa, "roles", [], 200);
  if (roles.some((r) => Number(r.data.level) === level))
    throw new HttpError(
      409,
      "level_taken",
      "Level itu sudah dipakai role lain.",
    );
  if (
    roles.some((r) => String(r.data.name).toLowerCase() === name.toLowerCase())
  )
    throw new HttpError(409, "name_taken", "Nama role sudah ada.");

  const id = `r-${crypto.randomUUID().slice(0, 8)}`;
  await commit(c.env, c.sa, [
    {
      path: `roles/${id}`,
      data: {
        name,
        level,
        system: false,
        perms,
        createdBy: c.actor.uid,
        createdByName: c.actor.name,
      },
      precondition: { exists: false },
      serverTime: ["createdAt"],
    },
    auditWrite(
      c.actor,
      "role.create",
      { type: "role", id, label: name },
      { level, perms: perms.length },
    ),
  ]).catch(conflictToHttp);
  return { id };
}

export async function updateRole(c: Ctx, body: Body): Promise<void> {
  requirePerm(c.actor, "roles");
  const id = str(body, "id");
  const role = await getDocument(c.env, c.sa, `roles/${id}`);
  if (!role) throw new HttpError(404, "not_found", "Role tidak ditemukan.");
  if (role.data.system === true)
    throw new HttpError(403, "forbidden", "Role sistem tidak dapat diubah.");
  assertLower(c.actor, Number(role.data.level), "role");

  const data: Record<string, unknown> = {};
  const detail: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = str(body, "name", { max: 80, label: "Nama role" });
    if (name !== role.data.name) {
      const roles = await queryDocuments(c.env, c.sa, "roles", [], 200);
      if (
        roles.some(
          (r) =>
            r.id !== id &&
            String(r.data.name).toLowerCase() === name.toLowerCase(),
        )
      )
        throw new HttpError(409, "name_taken", "Nama role sudah ada.");
      data.name = name;
      detail.name = { dari: role.data.name, menjadi: name };
    }
  }
  const levelWrites: Array<{
    path: string;
    data: Record<string, unknown>;
    mask: string[];
    precondition: { exists: true };
  }> = [];
  if (body.level !== undefined) {
    const level = body.level;
    if (typeof level !== "number" || !Number.isInteger(level) || level < 1)
      throw new HttpError(
        400,
        "bad_request",
        "Level harus bilangan bulat positif.",
      );
    if (!(level < c.actor.level))
      throw new HttpError(
        403,
        "forbidden",
        `Level role harus di bawah level Anda (maksimal ${c.actor.level - 1}).`,
      );
    if (level !== Number(role.data.level)) {
      const roles = await queryDocuments(c.env, c.sa, "roles", [], 200);
      if (roles.some((r) => r.id !== id && Number(r.data.level) === level))
        throw new HttpError(
          409,
          "level_taken",
          "Level itu sudah dipakai role lain.",
        );
      // Level disalin ke dokumen akun (dipakai Rules); akun pemegang role ini ikut disesuaikan dalam commit yang sama.
      const users = await queryDocuments(
        c.env,
        c.sa,
        "users",
        [{ field: "roleId", op: "EQUAL", value: id }],
        300,
      );
      if (users.length > 300)
        throw new HttpError(
          409,
          "too_many",
          "Terlalu banyak akun memakai role ini untuk diubah levelnya sekaligus.",
        );
      for (const u of users)
        levelWrites.push({
          path: `users/${u.id}`,
          data: { level },
          mask: ["level"],
          precondition: { exists: true },
        });
      data.level = level;
      detail.level = { dari: Number(role.data.level), menjadi: level };
      detail.akunDisesuaikan = users.length;
    }
  }
  if (body.perms !== undefined) {
    const perms = readPerms(body);
    const before = Array.isArray(role.data.perms)
      ? (role.data.perms as string[])
      : [];
    const changed = changedPerms(before, perms);
    // Hanya izin yang dimiliki pelaku yang boleh diberikan atau dicabut.
    if (!isSubset(changed, c.actor.perms))
      throw new HttpError(
        403,
        "forbidden",
        "Anda hanya dapat mengubah izin yang Anda miliki.",
      );
    if (changed.length) {
      data.perms = perms;
      detail.izinBerubah = changed;
    }
  }
  if (Object.keys(data).length === 0) return;

  await commit(c.env, c.sa, [
    {
      path: `roles/${id}`,
      data: { ...data, updatedBy: c.actor.uid, updatedByName: c.actor.name },
      mask: [...Object.keys(data), "updatedBy", "updatedByName", "updatedAt"],
      precondition: role.updateTime
        ? { updateTime: role.updateTime }
        : { exists: true },
      serverTime: ["updatedAt"],
    },
    ...levelWrites,
    auditWrite(
      c.actor,
      "role.update",
      { type: "role", id, label: String(data.name ?? role.data.name) },
      detail,
    ),
  ]).catch(conflictToHttp);
}

export async function deleteRole(c: Ctx, body: Body): Promise<void> {
  requirePerm(c.actor, "roles");
  const id = str(body, "id");
  const role = await getDocument(c.env, c.sa, `roles/${id}`);
  if (!role) throw new HttpError(404, "not_found", "Role tidak ditemukan.");
  if (role.data.system === true)
    throw new HttpError(403, "forbidden", "Role sistem tidak dapat dihapus.");
  assertLower(c.actor, Number(role.data.level), "role");
  const used = await queryDocuments(
    c.env,
    c.sa,
    "users",
    [{ field: "roleId", op: "EQUAL", value: id }],
    1,
  );
  if (used.length)
    throw new HttpError(
      409,
      "in_use",
      "Role masih dipakai akun. Pindahkan akunnya dulu.",
    );
  await commit(c.env, c.sa, [
    {
      path: `roles/${id}`,
      delete: true,
      precondition: role.updateTime
        ? { updateTime: role.updateTime }
        : { exists: true },
    },
    auditWrite(c.actor, "role.delete", {
      type: "role",
      id,
      label: String(role.data.name),
    }),
  ]).catch(conflictToHttp);
}
