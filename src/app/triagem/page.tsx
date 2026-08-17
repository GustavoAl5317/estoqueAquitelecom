import Link from "next/link";
import { Recycle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  ESTADO_FISICO,
  RESULTADO_TRIAGEM,
  STATUS_SERIAL,
  STATUS_TRIAGEM,
  TIPOS_ESTOQUE_SISTEMA,
} from "@/lib/dominio";
import { dataHora, diasDesde, numero, quantidade } from "@/lib/utils";
import {
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  Linha,
  Metrica,
  Tabela,
  Td,
  Th,
  Vazio,
} from "@/components/ui";
import { FormularioTriagem } from "@/components/formulario-triagem";

export const dynamic = "force-dynamic";

/**
 * 1.12 — LOGÍSTICA REVERSA.
 * CLIENTE → RETIRADO → DEVOLVIDO → TRIAGEM → estoque, manutenção ou descarte.
 */
export default async function Triagem() {
  const [pendentes, concluidas, aguardandoDevolucao, destinos, emManutencao] =
    await Promise.all([
      prisma.triagem.findMany({
        where: { status: { not: "CONCLUIDA" } },
        include: {
          material: true,
          unidade: true,
          origemMovimentacao: { include: { origem: true } },
        },
        orderBy: { criadoEm: "asc" },
      }),
      prisma.triagem.findMany({
        where: { status: "CONCLUIDA" },
        include: { material: true, unidade: true, responsavel: true, destino: true },
        orderBy: { concluidoEm: "desc" },
        take: 25,
      }),
      prisma.unidadeSerial.findMany({
        where: { status: "AGUARDANDO_DEVOLUCAO" },
        include: { material: true, detentor: true },
        orderBy: { atualizadoEm: "asc" },
      }),
      prisma.detentor.findMany({
        where: { estoque: { tipo: { notIn: TIPOS_ESTOQUE_SISTEMA } } },
        orderBy: { nome: "asc" },
      }),
      prisma.unidadeSerial.count({ where: { status: "EM_MANUTENCAO" } }),
    ]);

  const porResultado = concluidas.reduce<Record<string, number>>((mapa, t) => {
    if (t.resultado) mapa[t.resultado] = (mapa[t.resultado] ?? 0) + 1;
    return mapa;
  }, {});

  return (
    <>
      <CabecalhoPagina
        titulo="Logística reversa"
        descricao="Equipamento retirado de cliente não volta sozinho para o estoque disponível: passa por triagem e recebe um laudo."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metrica
          rotulo="Aguardando devolução"
          valor={numero(aguardandoDevolucao.length)}
          detalhe="em posse de técnicos"
          tom={aguardandoDevolucao.length > 0 ? "atencao" : "neutro"}
        />
        <Metrica
          rotulo="Na fila de triagem"
          valor={numero(pendentes.length)}
          tom={pendentes.length > 0 ? "roxo" : "neutro"}
        />
        <Metrica
          rotulo="Em manutenção"
          valor={numero(emManutencao)}
          tom={emManutencao > 0 ? "atencao" : "neutro"}
        />
        <Metrica
          rotulo="Aprovados (últimos)"
          valor={numero(porResultado["APROVADO"] ?? 0)}
          detalhe={`${porResultado["DESCARTE"] ?? 0} descartados`}
          tom="positivo"
        />
      </div>

      {/* fluxo do 1.12 */}
      <Cartao className="mb-4">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
          {[
            "Cliente",
            "Retirado",
            "Devolvido pelo técnico",
            "Triagem",
          ].map((etapa, i) => (
            <li key={etapa} className="flex items-center gap-2">
              {i > 0 && <span className="text-[var(--texto-3)]">→</span>}
              <span className="rounded-full bg-[var(--superficie-3)] px-2.5 py-1">
                {etapa}
              </span>
            </li>
          ))}
          <li className="flex items-center gap-2">
            <span className="text-[var(--texto-3)]">→</span>
            <span className="flex flex-wrap gap-1.5">
              <Etiqueta tom="positivo">Estoque</Etiqueta>
              <Etiqueta tom="atencao">Manutenção</Etiqueta>
              <Etiqueta tom="critico">Sucata</Etiqueta>
            </span>
          </li>
        </ol>
      </Cartao>

      <div className="space-y-4">
        <Cartao
          titulo={
            <span className="flex items-center gap-1.5">
              <Recycle className="size-3.5" /> Fila de triagem
            </span>
          }
          descricao={`${pendentes.length} item(ns) aguardando laudo`}
          semPadding
        >
          {pendentes.length === 0 ? (
            <Vazio
              titulo="Nenhum item aguardando triagem"
              descricao="Tudo que foi devolvido já recebeu laudo."
            />
          ) : (
            <ul className="divide-y divide-[var(--borda)]">
              {pendentes.map((triagem) => (
                <li key={triagem.id} className="p-4">
                  <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/materiais/${triagem.materialId}`}
                          className="font-medium hover:text-[var(--acento)]"
                        >
                          {triagem.material.nome}
                        </Link>
                        {triagem.unidade && (
                          <Link
                            href={`/seriais/${triagem.unidadeId}`}
                            className="font-mono text-xs text-[var(--texto-2)] hover:text-[var(--acento)]"
                          >
                            {triagem.unidade.serial}
                          </Link>
                        )}
                        <Etiqueta tom={STATUS_TRIAGEM.tom(triagem.status)} ponto>
                          {STATUS_TRIAGEM.rotulo(triagem.status)}
                        </Etiqueta>
                        {triagem.estadoRecebido && (
                          <Etiqueta tom={ESTADO_FISICO.tom(triagem.estadoRecebido)}>
                            recebido {ESTADO_FISICO.rotulo(triagem.estadoRecebido)}
                          </Etiqueta>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-[var(--texto-2)]">
                        {quantidade(triagem.quantidade, triagem.material.unidadeMedida)}
                        {triagem.origemMovimentacao?.origem && (
                          <> · devolvido por {triagem.origemMovimentacao.origem.nome}</>
                        )}
                      </p>
                      <p className="text-xs text-[var(--texto-3)]">
                        Na fila há {diasDesde(triagem.criadoEm)} dia(s) ·{" "}
                        {dataHora(triagem.criadoEm)}
                      </p>
                    </div>

                    <FormularioTriagem
                      triagemId={triagem.id}
                      estadoRecebido={triagem.estadoRecebido}
                      destinos={destinos.map((d) => ({ id: d.id, nome: d.nome }))}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        {/* 1.17 — o que ainda está com o técnico */}
        <Cartao
          titulo="Retirados de clientes, aguardando devolução"
          descricao={`${aguardandoDevolucao.length} equipamento(s) ainda em posse de técnicos`}
          semPadding
        >
          {aguardandoDevolucao.length === 0 ? (
            <Vazio titulo="Nenhum equipamento pendente de devolução" />
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Serial</Th>
                  <Th>Material</Th>
                  <Th>Com quem está</Th>
                  <Th>Estado</Th>
                  <Th numerico>Dias</Th>
                </tr>
              </thead>
              <tbody>
                {aguardandoDevolucao.map((unidade) => {
                  const dias = diasDesde(unidade.atualizadoEm);
                  return (
                    <Linha key={unidade.id}>
                      <Td>
                        <Link
                          href={`/seriais/${unidade.id}`}
                          className="font-mono text-xs font-medium hover:text-[var(--acento)]"
                        >
                          {unidade.serial}
                        </Link>
                      </Td>
                      <Td className="text-sm">{unidade.material.nome}</Td>
                      <Td className="text-sm">
                        {unidade.detentor ? (
                          <Link
                            href={`/locais/${unidade.detentorId}`}
                            className="hover:text-[var(--acento)]"
                          >
                            {unidade.detentor.nome}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td>
                        <Etiqueta tom={ESTADO_FISICO.tom(unidade.estadoFisico)}>
                          {ESTADO_FISICO.rotulo(unidade.estadoFisico)}
                        </Etiqueta>
                      </Td>
                      <Td numerico>
                        <span
                          style={{
                            color: dias >= 7 ? "var(--critico)" : undefined,
                            fontWeight: dias >= 7 ? 600 : undefined,
                          }}
                        >
                          {dias}
                        </span>
                      </Td>
                    </Linha>
                  );
                })}
              </tbody>
            </Tabela>
          )}
        </Cartao>

        <Cartao
          titulo="Triagens concluídas"
          descricao="Últimos 25 laudos"
          semPadding
        >
          {concluidas.length === 0 ? (
            <Vazio titulo="Nenhuma triagem concluída ainda" />
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Material</Th>
                  <Th>Serial</Th>
                  <Th>Resultado</Th>
                  <Th>Destino</Th>
                  <Th>Laudo</Th>
                  <Th>Concluída</Th>
                </tr>
              </thead>
              <tbody>
                {concluidas.map((triagem) => (
                  <Linha key={triagem.id}>
                    <Td className="text-sm">{triagem.material.nome}</Td>
                    <Td className="font-mono text-xs">
                      {triagem.unidade ? (
                        <Link
                          href={`/seriais/${triagem.unidadeId}`}
                          className="hover:text-[var(--acento)]"
                        >
                          {triagem.unidade.serial}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      {triagem.resultado && (
                        <Etiqueta tom={RESULTADO_TRIAGEM.tom(triagem.resultado)}>
                          {triagem.resultado === "APROVADO"
                            ? "Aprovado"
                            : triagem.resultado === "MANUTENCAO"
                              ? "Manutenção"
                              : "Descarte"}
                        </Etiqueta>
                      )}
                    </Td>
                    <Td className="text-sm">{triagem.destino?.nome ?? "—"}</Td>
                    <Td className="max-w-xs text-sm text-[var(--texto-2)]">
                      <span className="block truncate">{triagem.laudo ?? "—"}</span>
                    </Td>
                    <Td className="text-xs text-[var(--texto-3)]">
                      {dataHora(triagem.concluidoEm)}
                      {triagem.responsavel && (
                        <span className="block">{triagem.responsavel.nome}</span>
                      )}
                    </Td>
                  </Linha>
                ))}
              </tbody>
            </Tabela>
          )}
        </Cartao>
      </div>
    </>
  );
}
