import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  coberturaPorRegiao,
  lerPoligono,
  listarRegioes,
  performancePorRegiao,
  sugestoesDeRebalanceamento,
} from "@/lib/servicos/regioes";
import { minutosLegiveis } from "@/lib/servicos/eventos";
import { numero, percentual } from "@/lib/utils";
import {
  Aviso,
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
import {
  BairroEditavelEmLinha,
  FormularioBairro,
  FormularioRegiao,
} from "@/components/formularios-regiao";
import { EditorDePoligono } from "@/components/editor-poligono";

export const dynamic = "force-dynamic";

/**
 * 3.24 / 3.25 — REGIÕES E BAIRROS.
 *
 * O provedor pensa por bairro, não por coordenada. Aqui se define de quem é
 * cada área — e é esse vínculo que o score usa para preferir quem já conhece
 * o lugar.
 */
export default async function Regioes() {
  const [
    { regioes, semRegiao },
    cobertura,
    performance,
    sugestoes,
    tecnicos,
    equipes,
  ] = await Promise.all([
      listarRegioes(),
      coberturaPorRegiao(),
      performancePorRegiao(),
      sugestoesDeRebalanceamento(),
      prisma.tecnico.findMany({
        where: { ativo: true },
        select: { id: true, nome: true },
        orderBy: { nome: "asc" },
      }),
      prisma.equipe.findMany({
        where: { status: "ATIVA" },
        select: { id: true, nome: true },
        orderBy: { nome: "asc" },
      }),
    ]);

  const listaRegioes = regioes.map((r) => ({ id: r.id, nome: r.nome }));
  const todosBairros = [...regioes.flatMap((r) => r.bairros), ...semRegiao];
  const semResponsavel = todosBairros.filter((b) => !b.responsavelPrincipalId);
  const semReserva = todosBairros.filter((b) => !b.responsavelSecundarioId);

  return (
    <>
      <CabecalhoPagina
        titulo="Regiões e bairros"
        descricao="De quem é cada área. O responsável principal atende, o reserva cobre a falta — e o sistema usa os dois para recomendar técnico."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metrica rotulo="Regiões" valor={numero(regioes.length)} />
        <Metrica rotulo="Bairros" valor={numero(todosBairros.length)} />
        <Metrica
          rotulo="Sem responsável"
          valor={numero(semResponsavel.length)}
          tom={semResponsavel.length > 0 ? "critico" : "positivo"}
        />
        <Metrica
          rotulo="Sem reserva"
          valor={numero(semReserva.length)}
          tom={semReserva.length > 0 ? "atencao" : "positivo"}
        />
      </div>

      {semResponsavel.length > 0 && (
        <div className="mb-4">
          <Aviso
            tom="critico"
            titulo={`${semResponsavel.length} bairro(s) sem responsável definido`}
          >
            OS nesses bairros não recebem o bônus de região na recomendação —
            o sistema passa a escolher só por distância e carga.
          </Aviso>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {cobertura.linhas.length > 0 && (
            <Cartao titulo="Cobertura" semPadding>
              <Tabela>
                <thead>
                  <tr>
                    <Th>Região</Th>
                    <Th numerico>Bairros</Th>
                    <Th numerico>Sem responsável</Th>
                    <Th numerico>Sem reserva</Th>
                    <Th numerico>OS abertas</Th>
                  </tr>
                </thead>
                <tbody>
                  {cobertura.linhas.map((linha) => (
                    <Linha key={linha.id}>
                      <Td className="text-sm font-medium">{linha.nome}</Td>
                      <Td numerico>{linha.bairros}</Td>
                      <Td numerico>
                        {linha.semResponsavel > 0 ? (
                          <Etiqueta tom="critico">{linha.semResponsavel}</Etiqueta>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td numerico>
                        {linha.semReserva > 0 ? (
                          <Etiqueta tom="atencao">{linha.semReserva}</Etiqueta>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td numerico className="font-medium">
                        {numero(linha.osAbertas)}
                      </Td>
                    </Linha>
                  ))}
                  {cobertura.soltos.bairros > 0 && (
                    <Linha>
                      <Td className="text-sm text-[var(--texto-3)]">
                        Sem região
                      </Td>
                      <Td numerico>{cobertura.soltos.bairros}</Td>
                      <Td numerico>—</Td>
                      <Td numerico>—</Td>
                      <Td numerico>{numero(cobertura.soltos.osAbertas)}</Td>
                    </Linha>
                  )}
                </tbody>
              </Tabela>
            </Cartao>
          )}

          {/* 3.43 / 3.44 / 3.45 */}
          <Cartao
            titulo="Performance por região"
            descricao={`Últimos ${performance.dias} dias. Aderência é sobre as OS com prazo cadastrado; tempo no local vem da chegada detectada.`}
            semPadding
          >
            <Tabela>
              <thead>
                <tr>
                  <Th>Região</Th>
                  <Th numerico>Abertas</Th>
                  <Th numerico>Em risco</Th>
                  <Th numerico>Concluídas</Th>
                  <Th numerico>Aderência</Th>
                  <Th numerico>Ciclo médio</Th>
                  <Th numerico>No local</Th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...performance.linhas,
                  ...(performance.semRegiao ? [performance.semRegiao] : []),
                ].map((linha) => (
                  <Linha key={linha.nome}>
                    <Td className="text-sm font-medium">{linha.nome}</Td>
                    <Td numerico>{numero(linha.abertas)}</Td>
                    <Td numerico>
                      {linha.emRisco > 0 ? (
                        <Etiqueta tom="critico">{linha.emRisco}</Etiqueta>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td numerico>{numero(linha.concluidas)}</Td>
                    <Td numerico>
                      {linha.aderenciaSla === null ? (
                        "—"
                      ) : (
                        <Etiqueta
                          tom={
                            linha.aderenciaSla >= 90
                              ? "positivo"
                              : linha.aderenciaSla >= 70
                                ? "atencao"
                                : "critico"
                          }
                        >
                          {percentual(linha.aderenciaSla)}
                        </Etiqueta>
                      )}
                    </Td>
                    <Td numerico>
                      {linha.horasMedias === null
                        ? "—"
                        : `${numero(linha.horasMedias, 1)} h`}
                    </Td>
                    <Td numerico>{minutosLegiveis(linha.minutosNoLocal)}</Td>
                  </Linha>
                ))}
              </tbody>
            </Tabela>
          </Cartao>

          {/* 3.17 */}
          <Cartao
            titulo="Contorno dos bairros"
            descricao="Desenhado à mão sobre o mapa. É o que faz uma OS importada do SGP — que chega com coordenada e sem bairro — cair sozinha na área certa."
          >
            <EditorDePoligono
              bairros={todosBairros.map((bairro) => ({
                id: bairro.id,
                nome: bairro.nome,
                cidade: bairro.cidade,
                vertices: lerPoligono(bairro.poligono),
              }))}
            />
          </Cartao>

          {/* 3.46 / 3.57 */}
          {sugestoes.length > 0 && (
            <Cartao
              titulo="Rebalanceamento sugerido"
              descricao="Nada é redistribuído sozinho: cada linha aponta o desequilíbrio e leva à tela onde a decisão é tomada."
            >
              <div className="space-y-2">
                {sugestoes.map((sugestao, indice) => (
                  <Aviso
                    key={`${sugestao.tipo}-${indice}`}
                    tom={sugestao.tom}
                    titulo={sugestao.titulo}
                  >
                    {sugestao.detalhe}{" "}
                    <Link
                      href={sugestao.href}
                      className="font-medium underline underline-offset-2"
                    >
                      resolver
                    </Link>
                  </Aviso>
                ))}
              </div>
            </Cartao>
          )}

          {[
            ...regioes.map((r) => ({ nome: r.nome, bairros: r.bairros })),
            ...(semRegiao.length
              ? [{ nome: "Sem região", bairros: semRegiao }]
              : []),
          ].map((grupo) => (
            <Cartao key={grupo.nome} titulo={grupo.nome} semPadding>
              {grupo.bairros.length === 0 ? (
                <Vazio
                  titulo="Nenhum bairro nesta região"
                  descricao="Cadastre um bairro ao lado e escolha esta região."
                />
              ) : (
                <Tabela>
                  <thead>
                    <tr>
                      <Th>Bairro</Th>
                      <Th>Responsável</Th>
                      <Th>Reserva</Th>
                      <Th>Equipe</Th>
                      <Th numerico>OS</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.bairros.map((bairro) => (
                      <Linha key={bairro.id}>
                        <Td>
                          <span className="text-sm font-medium">{bairro.nome}</span>
                          <span className="block text-xs text-[var(--texto-3)]">
                            {bairro.cidade}
                          </span>
                        </Td>
                        <Td className="text-sm">
                          {bairro.responsavelPrincipal?.nome ?? (
                            <span className="text-[var(--critico)]">
                              não definido
                            </span>
                          )}
                        </Td>
                        <Td className="text-sm">
                          {bairro.responsavelSecundario?.nome ?? (
                            <span className="text-[var(--texto-3)]">—</span>
                          )}
                        </Td>
                        <Td className="text-sm">{bairro.equipe?.nome ?? "—"}</Td>
                        <Td numerico>
                          {bairro._count.ordens > 0 ? (
                            <Link
                              href={`/os?bairroId=${bairro.id}`}
                              className="hover:text-[var(--acento)]"
                            >
                              {numero(bairro._count.ordens)}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </Td>
                        <Td>
                          <BairroEditavelEmLinha
                            bairro={{
                              id: bairro.id,
                              nome: bairro.nome,
                              cidade: bairro.cidade,
                              regiaoId: bairro.regiaoId,
                              responsavelPrincipalId: bairro.responsavelPrincipalId,
                              responsavelSecundarioId:
                                bairro.responsavelSecundarioId,
                              equipeId: bairro.equipeId,
                            }}
                            regioes={listaRegioes}
                            tecnicos={tecnicos}
                            equipes={equipes}
                          />
                        </Td>
                      </Linha>
                    ))}
                  </tbody>
                </Tabela>
              )}
            </Cartao>
          ))}
        </div>

        <div className="space-y-4">
          <Cartao titulo="Nova região">
            <FormularioRegiao />
          </Cartao>

          <Cartao titulo="Novo bairro">
            <FormularioBairro
              regioes={listaRegioes}
              tecnicos={tecnicos}
              equipes={equipes}
            />
          </Cartao>
        </div>
      </div>
    </>
  );
}
