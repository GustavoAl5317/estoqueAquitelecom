import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TIPO_RASTREADOR } from "@/lib/dominio";
import {
  classificarFrescor,
  historicoDoRastreador,
} from "@/lib/servicos/frota";
import { parametros } from "@/lib/servicos/parametros";
import { dataHora, numero, tempoRelativo } from "@/lib/utils";
import {
  Aviso,
  BotaoLink,
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  ListaDefinicoes,
  Metrica,
} from "@/components/ui";
import { Trajeto } from "@/components/trajeto";

export const dynamic = "force-dynamic";

const PERIODOS = [
  { horas: 8, rotulo: "8 h" },
  { horas: 24, rotulo: "24 h" },
  { horas: 72, rotulo: "3 dias" },
  { horas: 168, rotulo: "7 dias" },
];

/**
 * 3.17 — HISTÓRICO DO APARELHO.
 *
 * O trajeto pertence ao aparelho, não ao alvo: se o rastreador mudar de carro,
 * o histórico continua sendo dele. Quem estava dirigindo em cada momento vem do
 * vínculo — e é isso que transforma trajeto de veículo em dia de trabalho de
 * uma pessoa. Para celular de técnico esse passo não existe: já é a pessoa.
 */
export default async function HistoricoRastreador({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ horas?: string }>;
}) {
  const { id } = await params;
  const { horas: horasBruto } = await searchParams;
  const horas = Number(horasBruto) || 24;

  const rastreador = await prisma.rastreador.findUnique({
    where: { id },
    include: {
      veiculo: { include: { tecnicoAtual: { include: { equipe: true } }, estoque: true } },
      tecnico: { include: { equipe: true } },
      unidadeSerial: { include: { material: true, detentor: true } },
    },
  });
  if (!rastreador) notFound();

  const [posicoes, vinculos, config] = await Promise.all([
    historicoDoRastreador(rastreador.id, horas),
    rastreador.veiculoId
      ? prisma.vinculoVeiculo.findMany({
          where: { veiculoId: rastreador.veiculoId },
          include: { tecnico: true, criadoPor: { select: { nome: true } } },
          orderBy: { inicio: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
    parametros(),
  ]);

  const ultima = posicoes.at(-1) ?? null;
  const { frescor, atrasoMinutos } = classificarFrescor(ultima?.capturadoEm ?? null);

  const paradas = posicoes.filter((p) => (p.velocidade ?? 0) === 0);
  const velocidadeMaxima = posicoes.reduce(
    (max, p) => Math.max(max, p.velocidade ?? 0),
    0,
  );

  // 3.33 — parada longa merece um olhar
  const paradasLongas = (() => {
    let contador = 0;
    let inicio: Date | null = null;
    for (const posicao of posicoes) {
      if ((posicao.velocidade ?? 0) === 0) {
        inicio ??= posicao.capturadoEm;
      } else if (inicio) {
        const minutos = (posicao.capturadoEm.getTime() - inicio.getTime()) / 60_000;
        if (minutos >= config.minutosParadaSuspeita) contador += 1;
        inicio = null;
      }
    }
    return contador;
  })();

  const alvo =
    rastreador.veiculo?.placa ??
    rastreador.tecnico?.nome ??
    (rastreador.unidadeSerial
      ? `${rastreador.unidadeSerial.material.nome} · ${rastreador.unidadeSerial.serial}`
      : null);

  return (
    <>
      <CabecalhoPagina
        titulo={rastreador.nome}
        descricao={
          alvo
            ? `${TIPO_RASTREADOR.rotulo(rastreador.tipo)} — ${alvo}`
            : "Aparelho ainda sem classificação"
        }
        acoes={
          <>
            <Etiqueta tom={TIPO_RASTREADOR.tom(rastreador.tipo)}>
              {TIPO_RASTREADOR.rotulo(rastreador.tipo)}
            </Etiqueta>
            <Etiqueta
              tom={
                frescor === "ATUAL" || frescor === "RECENTE"
                  ? "positivo"
                  : frescor === "DESATUALIZADA"
                    ? "atencao"
                    : "critico"
              }
              ponto
            >
              {ultima ? tempoRelativo(ultima.capturadoEm) : "sem sinal"}
            </Etiqueta>
            <BotaoLink href="/central">Central de Controle</BotaoLink>
          </>
        }
      />

      {rastreador.tipo === "NAO_CLASSIFICADO" && (
        <div className="mb-4">
          <Aviso tom="atencao" titulo="Este aparelho ainda não foi classificado">
            Ele reporta posição, mas o sistema não sabe de quem é essa posição.
            Diga o que ele é na{" "}
            <Link href="/central" className="font-medium underline">
              Central de Controle
            </Link>
            .
          </Aviso>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metrica rotulo="Posições no período" valor={numero(posicoes.length)} />
        <Metrica rotulo="Paradas" valor={numero(paradas.length)} />
        <Metrica
          rotulo="Velocidade máxima"
          valor={`${numero(velocidadeMaxima)} km/h`}
          tom={velocidadeMaxima > 90 ? "atencao" : "neutro"}
        />
        <Metrica
          rotulo="Paradas longas"
          valor={numero(paradasLongas)}
          detalhe={`acima de ${config.minutosParadaSuspeita} min`}
          tom={paradasLongas > 0 ? "atencao" : "positivo"}
        />
      </div>

      <Cartao className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--texto-2)]">
            Período:
          </span>
          {PERIODOS.map((periodo) => (
            <Link
              key={periodo.horas}
              href={`/rastreador/${rastreador.id}?horas=${periodo.horas}`}
              className="rounded-lg px-3 py-1.5 text-sm transition-colors"
              style={
                periodo.horas === horas
                  ? {
                      background: "var(--acento-suave)",
                      color: "var(--acento-texto)",
                      fontWeight: 500,
                    }
                  : { color: "var(--texto-2)" }
              }
            >
              {periodo.rotulo}
            </Link>
          ))}
        </div>
      </Cartao>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Cartao
            titulo="Trajeto"
            descricao="Verde é a partida, laranja são as paradas. Arraste a barra para percorrer o período."
          >
            {posicoes.length < 2 ? (
              <Aviso tom="atencao" titulo="Poucas posições no período">
                São necessárias ao menos duas leituras para desenhar um trajeto.
                Rode{" "}
                <code className="font-mono text-xs">
                  npm run traccar -- --loop 60
                </code>{" "}
                para manter a coleta ligada.
              </Aviso>
            ) : (
              <Trajeto
                pontos={posicoes.map((p) => ({
                  id: p.id,
                  latitude: p.latitude,
                  longitude: p.longitude,
                  velocidade: p.velocidade,
                  ignicao: p.ignicao,
                  endereco: p.endereco,
                  capturadoEm: p.capturadoEm.toISOString(),
                }))}
              />
            )}
          </Cartao>
        </div>

        <div className="space-y-4">
          <Cartao titulo="Aparelho">
            <ListaDefinicoes
              colunas={1}
              itens={[
                {
                  rotulo: "Identificador",
                  valor: (
                    <span className="font-mono text-xs">
                      {rastreador.identificador}
                    </span>
                  ),
                },
                { rotulo: "Modelo", valor: rastreador.modelo ?? "—" },
                {
                  rotulo: "Classificação",
                  valor: TIPO_RASTREADOR.rotulo(rastreador.tipo),
                },
                { rotulo: "Rastreando", valor: alvo ?? "nada ainda" },
                {
                  rotulo: "Última leitura",
                  valor: ultima
                    ? `${dataHora(ultima.capturadoEm)}${
                        atrasoMinutos !== null ? ` · ${atrasoMinutos} min atrás` : ""
                      }`
                    : "nunca",
                },
                { rotulo: "Situação", valor: rastreador.ativo ? "ativo" : "inativo" },
              ]}
            />
          </Cartao>

          {rastreador.tipo === "PESSOA" && rastreador.tecnico && (
            <Cartao titulo="Técnico">
              <ListaDefinicoes
                colunas={1}
                itens={[
                  { rotulo: "Nome", valor: rastreador.tecnico.nome },
                  { rotulo: "Matrícula", valor: rastreador.tecnico.matricula },
                  { rotulo: "Equipe", valor: rastreador.tecnico.equipe?.nome ?? "—" },
                ]}
              />
              <p className="mt-3 border-t border-[var(--borda)] pt-3 text-xs text-[var(--texto-3)]">
                Aparelho de pessoa não passa por vínculo: a coordenada já é dela.
                É a fonte de posição mais confiável que o sistema tem.
              </p>
            </Cartao>
          )}

          {rastreador.tipo === "EQUIPAMENTO" && rastreador.unidadeSerial && (
            <Cartao titulo="Equipamento">
              <ListaDefinicoes
                colunas={1}
                itens={[
                  {
                    rotulo: "Material",
                    valor: rastreador.unidadeSerial.material.nome,
                  },
                  {
                    rotulo: "Serial",
                    valor: (
                      <Link
                        href={`/seriais/${rastreador.unidadeSerial.id}`}
                        className="font-mono text-xs hover:text-[var(--acento)]"
                      >
                        {rastreador.unidadeSerial.serial}
                      </Link>
                    ),
                  },
                  {
                    rotulo: "Em posse de",
                    valor: rastreador.unidadeSerial.detentor?.nome ?? "—",
                  },
                  { rotulo: "Estado", valor: rastreador.unidadeSerial.estadoFisico },
                ]}
              />
            </Cartao>
          )}

          {rastreador.tipo === "VEICULO" && (
            <Cartao
              titulo="Quem dirigiu"
              descricao="É este vínculo que transforma posição de carro em posição de técnico."
              semPadding
            >
              <ul className="divide-y divide-[var(--borda)]">
                {vinculos.map((vinculo) => (
                  <li key={vinculo.id} className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {vinculo.tecnico.nome}
                      </span>
                      {vinculo.fim ? (
                        <Etiqueta tom="neutro">encerrado</Etiqueta>
                      ) : (
                        <Etiqueta tom="positivo" ponto>
                          ativo
                        </Etiqueta>
                      )}
                    </div>
                    <p className="text-xs text-[var(--texto-3)]">
                      {dataHora(vinculo.inicio)}
                      {vinculo.fim ? ` até ${dataHora(vinculo.fim)}` : ""}
                    </p>
                    <p className="text-xs text-[var(--texto-3)]">
                      registrado por {vinculo.criadoPor.nome}
                    </p>
                  </li>
                ))}
                {vinculos.length === 0 && (
                  <li className="px-4 py-6 text-center text-sm text-[var(--texto-3)]">
                    Nenhum vínculo registrado.
                  </li>
                )}
              </ul>
            </Cartao>
          )}
        </div>
      </div>
    </>
  );
}
