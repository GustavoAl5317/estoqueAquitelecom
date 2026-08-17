import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { FINALIDADE_RESERVA, STATUS_RESERVA, TIPOS_ESTOQUE_SISTEMA } from "@/lib/dominio";
import { dataHora, numero, quantidade } from "@/lib/utils";
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
import { AcaoRapida } from "@/components/formulario";
import { acaoEncerrarReserva } from "@/app/acoes/estoque";
import { FormularioReserva } from "@/components/formulario-reserva";

export const dynamic = "force-dynamic";

/** 1.14 — o reservado não sai do saldo, apenas deixa de estar disponível. */
export default async function Reservas() {
  const [ativas, encerradas, detentores, materiais, tecnicos, equipes] =
    await Promise.all([
      prisma.reserva.findMany({
        where: { status: "ATIVA" },
        include: {
          material: true,
          detentor: true,
          unidade: true,
          tecnico: true,
          equipe: true,
          criadoPor: { select: { nome: true } },
        },
        orderBy: { criadoEm: "desc" },
      }),
      prisma.reserva.findMany({
        where: { status: { not: "ATIVA" } },
        include: { material: true, detentor: true },
        orderBy: { encerradoEm: "desc" },
        take: 20,
      }),
      prisma.detentor.findMany({
        where: {
          OR: [
            { estoque: { tipo: { notIn: TIPOS_ESTOQUE_SISTEMA } } },
            { tipo: { in: ["TECNICO", "EQUIPE"] } },
          ],
        },
        orderBy: [{ tipo: "asc" }, { nome: "asc" }],
      }),
      prisma.material.findMany({
        where: { status: "ATIVO" },
        orderBy: { nome: "asc" },
      }),
      prisma.tecnico.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
      prisma.equipe.findMany({ orderBy: { nome: "asc" } }),
    ]);

  const totalReservado = ativas.reduce((s, r) => s + r.quantidade, 0);
  const vencendo = ativas.filter(
    (r) => r.expiraEm && r.expiraEm.getTime() - Date.now() < 48 * 3_600_000,
  ).length;

  return (
    <>
      <CabecalhoPagina
        titulo="Reservas"
        descricao="Separar material antes da retirada. O saldo continua no lugar — o que muda é o quanto está realmente disponível."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metrica rotulo="Reservas ativas" valor={numero(ativas.length)} tom="informativo" />
        <Metrica rotulo="Itens reservados" valor={numero(totalReservado)} />
        <Metrica
          rotulo="Vencendo em 48h"
          valor={numero(vencendo)}
          tom={vencendo > 0 ? "atencao" : "neutro"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Cartao titulo={`${ativas.length} reserva(s) ativa(s)`} semPadding>
            {ativas.length === 0 ? (
              <Vazio
                titulo="Nenhuma reserva ativa"
                descricao="Todo o saldo está livre para retirada."
              />
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Material</Th>
                    <Th>Local</Th>
                    <Th numerico>Quantidade</Th>
                    <Th>Finalidade</Th>
                    <Th>Para quem</Th>
                    <Th>Expira</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {ativas.map((reserva) => (
                    <Linha key={reserva.id}>
                      <Td>
                        <Link
                          href={`/materiais/${reserva.materialId}`}
                          className="font-medium hover:text-[var(--acento)]"
                        >
                          {reserva.material.nome}
                        </Link>
                        {reserva.unidade && (
                          <span className="block font-mono text-xs text-[var(--texto-3)]">
                            {reserva.unidade.serial}
                          </span>
                        )}
                      </Td>
                      <Td className="text-sm">
                        <Link
                          href={`/locais/${reserva.detentorId}`}
                          className="hover:text-[var(--acento)]"
                        >
                          {reserva.detentor.nome}
                        </Link>
                      </Td>
                      <Td numerico className="font-medium">
                        {quantidade(
                          reserva.quantidade,
                          reserva.material.unidadeMedida,
                        )}
                      </Td>
                      <Td>
                        <Etiqueta tom={FINALIDADE_RESERVA.tom(reserva.finalidade)}>
                          {FINALIDADE_RESERVA.rotulo(reserva.finalidade)}
                        </Etiqueta>
                      </Td>
                      <Td className="text-sm">
                        {reserva.tecnico?.nome ?? reserva.equipe?.nome ?? "—"}
                      </Td>
                      <Td className="text-xs text-[var(--texto-3)]">
                        {reserva.expiraEm ? dataHora(reserva.expiraEm) : "sem prazo"}
                      </Td>
                      <Td>
                        <AcaoRapida
                          acao={acaoEncerrarReserva}
                          campos={{ reservaId: reserva.id, status: "CANCELADA" }}
                          variante="sutil"
                          confirmacao="Cancelar esta reserva e liberar o material?"
                        >
                          Cancelar
                        </AcaoRapida>
                      </Td>
                    </Linha>
                  ))}
                </tbody>
              </Tabela>
            )}
          </Cartao>

          {encerradas.length > 0 && (
            <Cartao titulo="Encerradas recentemente" semPadding>
              <Tabela>
                <thead>
                  <tr>
                    <Th>Material</Th>
                    <Th>Local</Th>
                    <Th numerico>Quantidade</Th>
                    <Th>Situação</Th>
                    <Th>Encerrada</Th>
                  </tr>
                </thead>
                <tbody>
                  {encerradas.map((reserva) => (
                    <Linha key={reserva.id}>
                      <Td className="text-sm">{reserva.material.nome}</Td>
                      <Td className="text-sm">{reserva.detentor.nome}</Td>
                      <Td numerico>{numero(reserva.quantidade, 2)}</Td>
                      <Td>
                        <Etiqueta tom={STATUS_RESERVA.tom(reserva.status)}>
                          {STATUS_RESERVA.rotulo(reserva.status)}
                        </Etiqueta>
                      </Td>
                      <Td className="text-xs text-[var(--texto-3)]">
                        {dataHora(reserva.encerradoEm)}
                      </Td>
                    </Linha>
                  ))}
                </tbody>
              </Tabela>
            </Cartao>
          )}
        </div>

        <Cartao titulo="Nova reserva">
          <FormularioReserva
            materiais={materiais.map((m) => ({
              id: m.id,
              nome: m.nome,
              unidadeMedida: m.unidadeMedida,
            }))}
            detentores={detentores.map((d) => ({ id: d.id, nome: d.nome }))}
            tecnicos={tecnicos.map((t) => ({ id: t.id, nome: t.nome }))}
            equipes={equipes.map((e) => ({ id: e.id, nome: e.nome }))}
          />
        </Cartao>
      </div>
    </>
  );
}
