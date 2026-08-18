import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { historicoDoVeiculo, situacaoDaFrota } from "@/lib/servicos/frota";
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
 * 3.17 — HISTÓRICO DO VEÍCULO.
 *
 * O replay do trajeto e, junto dele, quem estava dirigindo em cada momento.
 * Sem o vínculo do motorista o trajeto é do carro; com ele, vira o dia de
 * trabalho de uma pessoa.
 */
export default async function HistoricoVeiculo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ horas?: string }>;
}) {
  const { id } = await params;
  const { horas: horasBruto } = await searchParams;
  const horas = Number(horasBruto) || 24;

  const veiculo = await prisma.veiculo.findUnique({
    where: { id },
    include: {
      tecnicoAtual: { include: { equipe: true } },
      estoque: true,
    },
  });
  if (!veiculo) notFound();

  const [posicoes, vinculos, frota, config] = await Promise.all([
    historicoDoVeiculo(veiculo.id, horas),
    prisma.vinculoVeiculo.findMany({
      where: { veiculoId: veiculo.id },
      include: { tecnico: true, criadoPor: { select: { nome: true } } },
      orderBy: { inicio: "desc" },
      take: 20,
    }),
    situacaoDaFrota(),
    parametros(),
  ]);

  const situacao = frota.find((v) => v.id === veiculo.id);

  const paradas = posicoes.filter((p) => (p.velocidade ?? 0) === 0);
  const velocidadeMaxima = posicoes.reduce(
    (max, p) => Math.max(max, p.velocidade ?? 0),
    0,
  );

  // 3.33 — parada longa com ignição desligada merece um olhar
  const paradasLongas = (() => {
    let contador = 0;
    let inicio: Date | null = null;
    for (const posicao of posicoes) {
      if ((posicao.velocidade ?? 0) === 0) {
        inicio ??= posicao.capturadoEm;
      } else if (inicio) {
        const minutos =
          (posicao.capturadoEm.getTime() - inicio.getTime()) / 60_000;
        if (minutos >= config.minutosParadaSuspeita) contador += 1;
        inicio = null;
      }
    }
    return contador;
  })();

  return (
    <>
      <CabecalhoPagina
        titulo={veiculo.placa}
        descricao={
          veiculo.apelido ?? veiculo.modelo ?? "Histórico de posições do veículo"
        }
        acoes={
          <>
            {situacao && (
              <Etiqueta
                tom={
                  situacao.frescor === "ATUAL" || situacao.frescor === "RECENTE"
                    ? "positivo"
                    : situacao.frescor === "DESATUALIZADA"
                      ? "atencao"
                      : "critico"
                }
                ponto
              >
                {situacao.capturadoEm
                  ? tempoRelativo(situacao.capturadoEm)
                  : "sem sinal"}
              </Etiqueta>
            )}
            <BotaoLink href="/central">Central de Controle</BotaoLink>
          </>
        }
      />

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
              href={`/frota/${veiculo.id}?horas=${periodo.horas}`}
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
                Rode <code className="font-mono text-xs">npm run traccar -- --loop 60</code>{" "}
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
          <Cartao titulo="Veículo">
            <ListaDefinicoes
              colunas={1}
              itens={[
                { rotulo: "Placa", valor: veiculo.placa },
                { rotulo: "Modelo", valor: veiculo.modelo ?? "—" },
                {
                  rotulo: "ID no rastreador",
                  valor: veiculo.rastreador ? (
                    <span className="font-mono text-xs">{veiculo.rastreador}</span>
                  ) : (
                    <span className="text-[var(--atencao)]">não amarrado</span>
                  ),
                },
                {
                  rotulo: "Técnico atual",
                  valor: veiculo.tecnicoAtual?.nome ?? "sem vínculo",
                },
                {
                  rotulo: "Equipe",
                  valor: veiculo.tecnicoAtual?.equipe?.nome ?? "—",
                },
                { rotulo: "Base", valor: veiculo.estoque?.nome ?? "—" },
                {
                  rotulo: "Situação",
                  valor: veiculo.ativo ? "ativo" : "inativo",
                },
              ]}
            />
          </Cartao>

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
        </div>
      </div>
    </>
  );
}
