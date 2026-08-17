"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { COOKIE_USUARIO } from "@/lib/sessao";

export async function trocarUsuario(usuarioId: string) {
  const jar = await cookies();
  jar.set(COOKIE_USUARIO, usuarioId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/", "layout");
}
