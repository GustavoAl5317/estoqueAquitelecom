import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ACAO_AUDITORIA } from "@/lib/dominio";
import { dataHora, numero } from "@/lib/utils";
import {
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  Metrica,
  Vazio,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const DESTINOS: Record<string, (id: string) => string> = {
  Material: (id) => `/materiais/${id}`,
  Entrada: (id) => `/entradas/${id}`,
  Movimentacao: (id) => `/movimentacoes/${id}`,
  UnidadeSerial: (id) => `/seriais/${id}`,
  Inventario: (id) => `/inventario/${id}`,
  Estoque: () => "/locais",
  Tecnico: () => "/locais",
  Equipe: () => "/locais",
  Reserva: () => "/reservas",
};

/** 1.24 — nada muda em silêncio: quem, o quê, quando e a partir de qual valor. */
export default async function Auditoria({
  searchParams,
}: {
  searchParams: Promise<{ acao?: string; entidade?: string; usuario?: string }>;
}) {
  const filtros = await searchParams;

  const where = {
    ...(filtros.acao ? { acao: filtros.acao } : {}),
    ...(filtros.entidade ? { entidade: filtros.entidade } : {}),
    ...(filtros.usuario ? { usuarioId: filtros.usuario } : {}),
  };

  const [registros, total, usuarios, porAcao] = await Promise.all([
    prisma.auditoria.findMany({
      where,
      include: { usuario: { select: { id: true, nome: true, papel: true } } },
      orderBy: { criadoEm: "desc" },
      take: 200,
    }),
    prisma.auditoria.count(),
    prisma.usuario.findMany({ orderBy: { nome: "asc" } }),
    prisma.auditoria.groupBy({ by: ["acao"], _count: { _all: true } }),
  ]);

  const hoje = registros.filter(
    (r) => r.criadoEm.toDateString() === new Date().toDateString(),
  ).length;

  return (
    <>
      <CabecalhoPagina
        titulo="Auditoria"
        descricao="Registro automático de tudo que foi criado, editado, movimentado, recebido, devolvido ou ajustado."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metrica rotulo="Registros totais" valor={numero(total)} />
        <Metrica rotulo="No recorte atual" valor={numero(registros.length)} />
        <Metrica rotulo="Hoje" valor={numero(hoje)} tom="informativo" />
      </div>

      <Cartao className="mb-4">
        <form className="grid gap-3 sm:grid-cols-4">
          <select name="acao" defaultValue={filtros.acao ?? ""}>
            <option value="">Todas as ações</option>
            {porAcao
              .sort((a, b) => b._count._all - a._count._all)
              .map((grupo) => (
                <option key={grupo.acao} value={grupo.acao}>
                  {ACAO_AUDITORIA.rotulo(grupo.acao)} ({grupo._count._all})
                </option>
              ))}
          </select>
          <select name="entidade" defaultValue={filtros.entidade ?? ""}>
            <option value="">Todas as entidades</option>
            {Object.keys(DESTINOS).map((entidade) => (
              <option key={entidade} value={entidade}>
                {entidade}
              </option>
            ))}
          </select>
          <select name="usuario" defaultValue={filtros.usuario ?? ""}>
            <option value="">Todos os usuários</option>
            {usuarios.map((usuario) => (
              <option key={usuario.id} value={usuario.id}>
                {usuario.nome}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-lg bg-[var(--acento)] px-3 py-1.5 text-sm font-medium text-white"
            >
              Filtrar
            </button>
            {(filtros.acao || filtros.entidade || filtros.usuario) && (
              <Link
                href="/auditoria"
                className="rounded-lg px-3 py-1.5 text-sm text-[var(--texto-2)]"
              >
                Limpar
              </Link>
            )}
          </div>
        </form>
      </Cartao>

      <Cartao
        titulo={`${numero(registros.length)} registro(s)`}
        descricao={total > 200 ? "Exibindo os 200 mais recentes" : undefined}
        semPadding
      >
        {registros.length === 0 ? (
          <Vazio titulo="Nenhum registro de auditoria no recorte" />
        ) : (
          <ul className="divide-y divide-[var(--borda)]">
            {registros.map((registro) => {
              const destino = DESTINOS[registro.entidade]?.(registro.entidadeId);
              return (
                <li
                  key={registro.id}
                  className="flex flex-wrap items-start gap-3 px-4 py-2.5"
                >
                  <Etiqueta tom={ACAO_AUDITORIA.tom(registro.acao)}>
                    {ACAO_AUDITORIA.rotulo(registro.acao)}
                  </Etiqueta>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      {destino ? (
                        <Link
                          href={destino}
                          className="hover:text-[var(--acento)]"
                        >
                          {registro.descricao}
                        </Link>
                      ) : (
                        registro.descricao
                      )}
                    </p>
                    <p className="text-xs text-[var(--texto-3)]">
                      {registro.usuario.nome} · {registro.entidade} ·{" "}
                      {dataHora(registro.criadoEm)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>
    </>
  );
}
