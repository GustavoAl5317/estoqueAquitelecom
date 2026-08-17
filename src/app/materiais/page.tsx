import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  NIVEL_ESTOQUE,
  TIPO_CONTROLE,
  UNIDADE_MEDIDA,
} from "@/lib/dominio";
import { saldosConsolidados } from "@/lib/servicos/consultas";
import { moeda, normalizar, numero, quantidade } from "@/lib/utils";
import {
  BarraNivel,
  BotaoLink,
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

export default async function ListaMateriais({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    categoria?: string;
    nivel?: string;
    controle?: string;
  }>;
}) {
  const filtros = await searchParams;
  const [consolidado, categorias] = await Promise.all([
    saldosConsolidados(),
    prisma.categoria.findMany({ orderBy: { ordem: "asc" } }),
  ]);

  const termo = filtros.q ? normalizar(filtros.q) : "";
  const lista = consolidado.filter((material) => {
    if (filtros.categoria && material.categoriaId !== filtros.categoria) return false;
    if (filtros.nivel && material.nivel !== filtros.nivel) return false;
    if (filtros.controle && material.controle !== filtros.controle) return false;
    if (
      termo &&
      !normalizar(
        `${material.nome} ${material.codigoInterno} ${material.fabricante ?? ""} ${material.modelo ?? ""}`,
      ).includes(termo)
    ) {
      return false;
    }
    return true;
  });

  const valorFiltrado = lista.reduce((soma, m) => soma + m.valorTotal, 0);

  return (
    <>
      <CabecalhoPagina
        titulo="Materiais"
        descricao="Cadastro, saldo consolidado e nível de criticidade de cada item."
        acoes={
          <BotaoLink href="/materiais/novo" variante="primario">
            <Plus className="size-4" /> Novo material
          </BotaoLink>
        }
      />

      {/* 1.29 — filtros avançados */}
      <Cartao className="mb-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input
            type="search"
            name="q"
            defaultValue={filtros.q}
            placeholder="Nome, código, fabricante ou modelo"
            className="lg:col-span-2"
          />
          <select name="categoria" defaultValue={filtros.categoria ?? ""}>
            <option value="">Todas as categorias</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nome}
              </option>
            ))}
          </select>
          <select name="nivel" defaultValue={filtros.nivel ?? ""}>
            <option value="">Todos os níveis</option>
            {NIVEL_ESTOQUE.opcoes.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.rotulo}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <select name="controle" defaultValue={filtros.controle ?? ""}>
              <option value="">Todo tipo</option>
              {TIPO_CONTROLE.opcoes.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>
                  {opcao.rotulo}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-[var(--acento)] px-3 text-sm font-medium text-white"
            >
              Filtrar
            </button>
          </div>
        </form>
      </Cartao>

      <Cartao
        titulo={`${numero(lista.length)} materiais`}
        descricao={`Valor total do recorte: ${moeda(valorFiltrado)}`}
        acoes={
          (filtros.q || filtros.categoria || filtros.nivel || filtros.controle) && (
            <Link href="/materiais" className="text-xs text-[var(--acento)]">
              Limpar filtros
            </Link>
          )
        }
        semPadding
      >
        {lista.length === 0 ? (
          <Vazio
            titulo="Nenhum material encontrado"
            descricao="Ajuste os filtros ou cadastre um novo material."
          />
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>Material</Th>
                <Th>Categoria</Th>
                <Th numerico>Em estoque</Th>
                <Th numerico>Com técnicos</Th>
                <Th numerico>Reservado</Th>
                <Th numerico>Disponível</Th>
                <Th>Nível</Th>
                <Th numerico>Valor</Th>
              </tr>
            </thead>
            <tbody>
              {lista.map((material) => (
                <Linha key={material.materialId}>
                  <Td>
                    <Link
                      href={`/materiais/${material.materialId}`}
                      className="block font-medium hover:text-[var(--acento)]"
                    >
                      {material.nome}
                    </Link>
                    <span className="text-xs text-[var(--texto-3)]">
                      {material.codigoInterno}
                      {material.controle === "SERIAL" && " · serializado"}
                    </span>
                  </Td>
                  <Td>
                    <span className="flex items-center gap-1.5 text-sm">
                      <span
                        className="size-2 rounded-full"
                        style={{ background: material.cor }}
                      />
                      {material.categoria}
                    </span>
                  </Td>
                  <Td numerico>{numero(material.emEstoque)}</Td>
                  <Td numerico>
                    {material.emPosseTecnicos > 0 ? (
                      <span className="text-[var(--roxo)]">
                        {numero(material.emPosseTecnicos)}
                      </span>
                    ) : (
                      <span className="text-[var(--texto-3)]">—</span>
                    )}
                  </Td>
                  <Td numerico>
                    {material.reservado > 0 ? (
                      numero(material.reservado)
                    ) : (
                      <span className="text-[var(--texto-3)]">—</span>
                    )}
                  </Td>
                  <Td numerico>
                    <span className="font-medium">
                      {quantidade(material.disponivel, material.unidadeMedida)}
                    </span>
                    <span className="block text-xs text-[var(--texto-3)]">
                      mín. {numero(material.quantidadeMinima)}
                    </span>
                  </Td>
                  <Td className="w-32">
                    <Etiqueta tom={NIVEL_ESTOQUE.tom(material.nivel)} ponto>
                      {NIVEL_ESTOQUE.rotulo(material.nivel)}
                    </Etiqueta>
                    <span className="mt-1.5 block">
                      <BarraNivel
                        percentual={material.percentual}
                        tom={NIVEL_ESTOQUE.tom(material.nivel)}
                      />
                    </span>
                  </Td>
                  <Td numerico>
                    {moeda(material.valorTotal)}
                    <span className="block text-xs text-[var(--texto-3)]">
                      {moeda(material.valorMedio)}/
                      {UNIDADE_MEDIDA.rotulo(material.unidadeMedida).toLowerCase()}
                    </span>
                  </Td>
                </Linha>
              ))}
            </tbody>
          </Tabela>
        )}
      </Cartao>
    </>
  );
}
