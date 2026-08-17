import Link from "next/link";
import { MapPin, Users, Warehouse } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { TIPO_ESTOQUE, TIPOS_ESTOQUE_SISTEMA } from "@/lib/dominio";
import { moeda, numero } from "@/lib/utils";
import {
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  Linha,
  Tabela,
  Td,
  Th,
  Vazio,
} from "@/components/ui";

export const dynamic = "force-dynamic";

/** 1.1 / 1.8 / 1.9 — todo mundo que pode deter material, no mesmo lugar. */
export default async function Locais() {
  const [detentores, saldos] = await Promise.all([
    prisma.detentor.findMany({
      include: {
        estoque: { include: { responsavel: true } },
        tecnico: { include: { equipe: true } },
        equipe: true,
      },
      orderBy: [{ tipo: "asc" }, { nome: "asc" }],
    }),
    prisma.saldo.findMany({
      where: { quantidade: { gt: 0 } },
      include: { material: { select: { valorMedio: true } } },
    }),
  ]);

  const resumo = new Map<string, { itens: number; valor: number; linhas: number }>();
  for (const saldo of saldos) {
    const atual = resumo.get(saldo.detentorId) ?? { itens: 0, valor: 0, linhas: 0 };
    atual.itens += saldo.quantidade;
    atual.valor += saldo.quantidade * saldo.material.valorMedio;
    atual.linhas += 1;
    resumo.set(saldo.detentorId, atual);
  }

  const grupos = [
    {
      chave: "ESTOQUE",
      titulo: "Locais de estoque",
      icone: <Warehouse className="size-3.5" />,
      itens: detentores.filter(
        (d) =>
          d.tipo === "ESTOQUE" &&
          !TIPOS_ESTOQUE_SISTEMA.includes(d.estoque?.tipo ?? ""),
      ),
    },
    {
      chave: "TECNICO",
      titulo: "Técnicos",
      icone: <Users className="size-3.5" />,
      itens: detentores.filter((d) => d.tipo === "TECNICO"),
    },
    {
      chave: "EQUIPE",
      titulo: "Equipes",
      icone: <Users className="size-3.5" />,
      itens: detentores.filter((d) => d.tipo === "EQUIPE"),
    },
    {
      chave: "SISTEMA",
      titulo: "Áreas de logística reversa",
      icone: <MapPin className="size-3.5" />,
      itens: detentores.filter(
        (d) =>
          d.tipo === "ESTOQUE" &&
          TIPOS_ESTOQUE_SISTEMA.includes(d.estoque?.tipo ?? ""),
      ),
    },
  ];

  return (
    <>
      <CabecalhoPagina
        titulo="Locais e detentores"
        descricao="Estoques físicos, técnicos e equipes — todos podem deter material, e o sistema sabe exatamente quanto cada um tem."
      />

      <div className="space-y-4">
        {grupos.map((grupo) =>
          grupo.itens.length === 0 ? null : (
            <Cartao
              key={grupo.chave}
              titulo={
                <span className="flex items-center gap-1.5">
                  {grupo.icone} {grupo.titulo}
                </span>
              }
              descricao={`${grupo.itens.length} registro(s)`}
              semPadding
            >
              <Tabela>
                <thead>
                  <tr>
                    <Th>Nome</Th>
                    <Th>Detalhe</Th>
                    <Th numerico>Materiais</Th>
                    <Th numerico>Itens</Th>
                    <Th numerico>Valor</Th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.itens.map((detentor) => {
                    const dados = resumo.get(detentor.id);
                    return (
                      <Linha key={detentor.id}>
                        <Td>
                          <Link
                            href={`/locais/${detentor.id}`}
                            className="font-medium hover:text-[var(--acento)]"
                          >
                            {detentor.nome}
                          </Link>
                          {detentor.estoque && (
                            <span className="mt-0.5 block">
                              <Etiqueta tom={TIPO_ESTOQUE.tom(detentor.estoque.tipo)}>
                                {TIPO_ESTOQUE.rotulo(detentor.estoque.tipo)}
                              </Etiqueta>
                            </span>
                          )}
                        </Td>
                        <Td className="text-sm text-[var(--texto-2)]">
                          {detentor.estoque?.endereco ??
                            detentor.tecnico?.equipe?.nome ??
                            (detentor.tecnico
                              ? `Matrícula ${detentor.tecnico.matricula}`
                              : detentor.equipe?.tipo) ??
                            "—"}
                          {detentor.estoque?.responsavel && (
                            <span className="block text-xs text-[var(--texto-3)]">
                              Responsável: {detentor.estoque.responsavel.nome}
                            </span>
                          )}
                        </Td>
                        <Td numerico>{numero(dados?.linhas ?? 0)}</Td>
                        <Td numerico>{numero(dados?.itens ?? 0)}</Td>
                        <Td numerico className="font-medium">
                          {moeda(dados?.valor ?? 0)}
                        </Td>
                      </Linha>
                    );
                  })}
                </tbody>
              </Tabela>
            </Cartao>
          ),
        )}

        {detentores.length === 0 && (
          <Cartao semPadding>
            <Vazio titulo="Nenhum local cadastrado" />
          </Cartao>
        )}
      </div>
    </>
  );
}
