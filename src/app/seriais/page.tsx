import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ESTADO_FISICO, STATUS_SERIAL } from "@/lib/dominio";
import { dataHora, numero } from "@/lib/utils";
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

/** 1.3 / 1.13 / 1.28 / 1.29 — rastreio individual dos equipamentos */
export default async function ListaSeriais({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    material?: string;
    detentor?: string;
    estado?: string;
  }>;
}) {
  const filtros = await searchParams;

  const where = {
    ...(filtros.status ? { status: filtros.status } : {}),
    ...(filtros.material ? { materialId: filtros.material } : {}),
    ...(filtros.detentor ? { detentorId: filtros.detentor } : {}),
    ...(filtros.estado ? { estadoFisico: filtros.estado } : {}),
    ...(filtros.q
      ? {
          OR: [
            { serial: { contains: filtros.q } },
            { macAddress: { contains: filtros.q } },
            { patrimonio: { contains: filtros.q } },
            { clienteRef: { contains: filtros.q } },
          ],
        }
      : {}),
  };

  const [unidades, total, materiais, detentores, porStatus] = await Promise.all([
    prisma.unidadeSerial.findMany({
      where,
      include: { material: true, detentor: true },
      orderBy: { atualizadoEm: "desc" },
      take: 200,
    }),
    prisma.unidadeSerial.count({ where }),
    prisma.material.findMany({
      where: { controle: "SERIAL" },
      orderBy: { nome: "asc" },
    }),
    prisma.detentor.findMany({ orderBy: [{ tipo: "asc" }, { nome: "asc" }] }),
    prisma.unidadeSerial.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  return (
    <>
      <CabecalhoPagina
        titulo="Equipamentos"
        descricao="Cada unidade serializada e seu ciclo de vida completo: onde está, com quem está e em que estado."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/seriais"
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            !filtros.status
              ? "bg-[var(--acento-suave)] text-[var(--acento-texto)]"
              : "bg-[var(--superficie)] text-[var(--texto-2)]"
          }`}
        >
          Todos {numero(porStatus.reduce((s, p) => s + p._count._all, 0))}
        </Link>
        {porStatus
          .sort((a, b) => b._count._all - a._count._all)
          .map((grupo) => (
            <Link
              key={grupo.status}
              href={`/seriais?status=${grupo.status}`}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                filtros.status === grupo.status
                  ? "bg-[var(--acento-suave)] text-[var(--acento-texto)]"
                  : "bg-[var(--superficie)] text-[var(--texto-2)]"
              }`}
            >
              {STATUS_SERIAL.rotulo(grupo.status)} {grupo._count._all}
            </Link>
          ))}
      </div>

      <Cartao className="mb-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            type="search"
            name="q"
            defaultValue={filtros.q}
            placeholder="Serial, MAC, patrimônio ou cliente"
          />
          <select name="material" defaultValue={filtros.material ?? ""}>
            <option value="">Todos os materiais</option>
            {materiais.map((material) => (
              <option key={material.id} value={material.id}>
                {material.nome}
              </option>
            ))}
          </select>
          <select name="detentor" defaultValue={filtros.detentor ?? ""}>
            <option value="">Qualquer detentor</option>
            {detentores.map((detentor) => (
              <option key={detentor.id} value={detentor.id}>
                {detentor.nome}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <select name="estado" defaultValue={filtros.estado ?? ""}>
              <option value="">Qualquer estado</option>
              {ESTADO_FISICO.opcoes.map((opcao) => (
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
        titulo={`${numero(total)} equipamentos`}
        descricao={total > 200 ? "Exibindo os 200 mais recentes" : undefined}
        semPadding
      >
        {unidades.length === 0 ? (
          <Vazio titulo="Nenhum equipamento encontrado" />
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>Serial</Th>
                <Th>Material</Th>
                <Th>Status</Th>
                <Th>Estado</Th>
                <Th>Onde está</Th>
                <Th>Última movimentação</Th>
              </tr>
            </thead>
            <tbody>
              {unidades.map((unidade) => (
                <Linha key={unidade.id}>
                  <Td>
                    <Link
                      href={`/seriais/${unidade.id}`}
                      className="font-mono text-xs font-medium hover:text-[var(--acento)]"
                    >
                      {unidade.serial}
                    </Link>
                    {unidade.macAddress && (
                      <span className="block font-mono text-[11px] text-[var(--texto-3)]">
                        {unidade.macAddress}
                      </span>
                    )}
                  </Td>
                  <Td className="text-sm">{unidade.material.nome}</Td>
                  <Td>
                    <Etiqueta tom={STATUS_SERIAL.tom(unidade.status)} ponto>
                      {STATUS_SERIAL.rotulo(unidade.status)}
                    </Etiqueta>
                  </Td>
                  <Td>
                    <Etiqueta tom={ESTADO_FISICO.tom(unidade.estadoFisico)}>
                      {ESTADO_FISICO.rotulo(unidade.estadoFisico)}
                    </Etiqueta>
                  </Td>
                  <Td className="text-sm">
                    {unidade.detentor ? (
                      <Link
                        href={`/locais/${unidade.detentorId}`}
                        className="hover:text-[var(--acento)]"
                      >
                        {unidade.detentor.nome}
                      </Link>
                    ) : unidade.clienteRef ? (
                      `Cliente ${unidade.clienteRef}`
                    ) : (
                      <span className="text-[var(--texto-3)]">—</span>
                    )}
                  </Td>
                  <Td className="text-xs text-[var(--texto-3)]">
                    {dataHora(unidade.atualizadoEm)}
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
