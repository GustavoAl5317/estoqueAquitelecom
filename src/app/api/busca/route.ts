import { NextResponse } from "next/server";
import { buscaGlobal } from "@/lib/servicos/consultas";

export async function GET(request: Request) {
  const termo = new URL(request.url).searchParams.get("q") ?? "";
  if (termo.trim().length < 2) return NextResponse.json([]);
  return NextResponse.json(await buscaGlobal(termo));
}
