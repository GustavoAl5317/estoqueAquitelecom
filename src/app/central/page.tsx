import Link from "next/link";
import { Radio } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { TIPOS_ESTOQUE_SISTEMA } from "@/lib/dominio";
import {
  posicoesDosTecnicos,
  situacaoDosRastreadores,
  vinculosRecentes,
} from "@/lib/servicos/frota";
import { parametros, somaDosPesos } from "@/lib/servicos/parametros";
import { dataHora, numero } from "@/lib/utils";
import {
  Aviso,
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  Metrica,
  Vazio,
} from "@/components/ui";
import { MapaOperacional, type PontoMapa } from "@/components/mapa-operacional";
import {
  FormularioParametros,
  FormularioPosicao,
  FormularioVeiculo,
  PainelFrota,
  PainelRastreadores,
} from "@/components/central-controle";

export const dynamic = "force-dynamic";

/**
 * 3.30 — CENTRAL DE CONTROLE.
 *
 * Reúne o que a supervisão precisa para decidir: onde estão os aparelhos, o que
 * cada um está rastreando, quem está dirigindo cada carro, e com que pesos o
 * sistema recomenda técnico.
 */
export default async function Central() {
  const [rastreadores, posicoesTecnicos, vinculos, tecnicos, veiculos, estoques, seriais, config, ingestaoAtiva] =
    await Promise.all([
      situacaoDosRastreadores(),
      posicoesDosTecnicos(),
      vinculosRecentes(12),
      prisma.tecnico.findMany({
        where: { ativo: true },
        include: { equipe: true },
        orderBy: { nome: "asc" },
      }),
      prisma.veiculo.findMany({
        where: { ativo: true },
        orderBy: { placa: "asc" },
      }),
      prisma.estoque.findMany({
        where: { tipo: { notIn: TIPOS_ESTOQUE_SISTEMA }, status: "ATIVO" },
        orderBy: { nome: "asc" },
      }),
      // 1.x — só o patrimônio serializado pode carregar um rastreador
      prisma.unidadeSerial.findMany({
        where: { status: { notIn: ["BAIXADO", "SUCATA", "PERDIDO"] } },
        include: { material: { select: { nome: true } } },
        orderBy: { serial: "asc" },
        take: 400,
      }),
      parametros(),
      Promise.resolve(Boolean(process.env.RASTREADOR_SEGREDO)),
    ]);

  const frota = rastreadores.filter((r) => r.tipo === "VEICULO");
  const naoClassificados = rastreadores.filter(
    (r) => r.tipo === "NAO_CLASSIFICADO",
  );
  const porCelular = posicoesTecnicos.filter((p) => p.fonte === "CELULAR").length;
  const semPosicao = tecnicos.length - posicoesTecnicos.length;
  const desatualizados = rastreadores.filter(
    (r) => r.frescor === "DESATUALIZADA" || r.frescor === "SEM_SINAL",
  ).length;

  const pontos: PontoMapa[] = [
    ...rastreadores
      .filter((r) => r.latitude !== null && r.longitude !== null)
      .map<PontoMapa>((r) => ({
        id: r.id,
        rotulo: r.tecnicoNome ?? r.alvo ?? r.nome,
        detalhe:
          r.tipo === "PESSOA"
            ? "celular"
            : r.tipo === "EQUIPAMENTO"
              ? "equipamento"
              : r.tipo === "VEICULO"
                ? (r.placa ?? "veículo")
                : "não classificado",
        latitude: r.latitude!,
        longitude: r.longitude!,
        tipo: r.tipo === "EQUIPAMENTO" ? "ESTOQUE" : "VEICULO",
        tom:
          r.frescor === "ATUAL" || r.frescor === "RECENTE"
            ? "ok"
            : r.frescor === "DESATUALIZADA"
              ? "atencao"
              : "critico",
      })),
    ...estoques
      .filter((e) => e.latitude !== null && e.longitude !== null)
      .map<PontoMapa>((e) => ({
        id: e.id,
        rotulo: e.nome,
        detalhe: "estoque",
        latitude: e.latitude!,
        longitude: e.longitude!,
        tipo: "ESTOQUE",
      })),
  ];

  return (
    <>
      <CabecalhoPagina
        titulo="Central de Controle"
        descricao="O que cada aparelho está rastreando, onde está, e com que critérios o sistema recomenda técnico."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metrica
          rotulo="Aparelhos"
          valor={numero(rastreadores.length)}
          detalhe={
            naoClassificados.length
              ? `${naoClassificados.length} sem classificar`
              : "todos classificados"
          }
          tom={naoClassificados.length > 0 ? "atencao" : "positivo"}
        />
        <Metrica
          rotulo="Técnicos localizados"
          valor={`${posicoesTecnicos.length}/${tecnicos.length}`}
          tom={semPosicao > 0 ? "atencao" : "positivo"}
          detalhe={semPosicao > 0 ? `${semPosicao} sem posição` : "todos na tela"}
        />
        <Metrica
          rotulo="Pelo próprio celular"
          valor={numero(porCelular)}
          tom={porCelular > 0 ? "roxo" : "neutro"}
          detalhe="posição da pessoa, não do carro"
        />
        <Metrica
          rotulo="Posição desatualizada"
          valor={numero(desatualizados)}
          tom={desatualizados > 0 ? "atencao" : "positivo"}
        />
      </div>

      {!ingestaoAtiva && (
        <div className="mb-4">
          <Aviso tom="atencao" titulo="Recepção de posições desligada">
            A rota <code className="font-mono text-xs">/api/rastreador</code> só
            aceita dados depois que{" "}
            <code className="font-mono text-xs">RASTREADOR_SEGREDO</code> for
            definido no <code className="font-mono text-xs">.env</code>. A
            sincronização pelo Traccar não depende disso.
          </Aviso>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Cartao
            titulo="Mapa operacional"
            descricao="Posição relativa dos aparelhos e dos estoques"
          >
            <MapaOperacional pontos={pontos} />
          </Cartao>

          {/* 3.1 */}
          <Cartao
            titulo="Aparelhos rastreados"
            descricao="Carro, celular de técnico ou equipamento — a plataforma não distingue, e é aqui que alguém resolve."
          >
            <PainelRastreadores
              rastreadores={rastreadores}
              alvos={{
                veiculos: veiculos.map((v) => ({
                  id: v.id,
                  placa: v.placa,
                  apelido: v.apelido,
                })),
                tecnicos: tecnicos.map((t) => ({
                  id: t.id,
                  nome: t.nome,
                  equipe: t.equipe?.nome ?? null,
                })),
                seriais: seriais.map((u) => ({
                  id: u.id,
                  rotulo: `${u.material.nome} · ${u.serial}`,
                })),
              }}
            />
          </Cartao>

          <Cartao
            titulo="Quem está com cada veículo"
            descricao="Só o carro precisa disso: o celular já é a pessoa."
          >
            <PainelFrota
              frota={frota}
              tecnicos={tecnicos.map((t) => ({
                id: t.id,
                nome: t.nome,
                equipe: t.equipe?.nome ?? null,
              }))}
            />
          </Cartao>

          <Cartao titulo="Histórico de vínculos" semPadding>
            {vinculos.length === 0 ? (
              <Vazio titulo="Nenhuma troca registrada" />
            ) : (
              <ul className="divide-y divide-[var(--borda)]">
                {vinculos.map((vinculo) => (
                  <li
                    key={vinculo.id}
                    className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm"
                  >
                    <span className="font-mono text-xs font-semibold">
                      {vinculo.veiculo.placa}
                    </span>
                    <span className="text-[var(--texto-3)]">→</span>
                    <span>{vinculo.tecnico.nome}</span>
                    {vinculo.fim ? (
                      <Etiqueta tom="neutro">encerrado</Etiqueta>
                    ) : (
                      <Etiqueta tom="positivo" ponto>
                        ativo
                      </Etiqueta>
                    )}
                    <span className="ml-auto text-xs text-[var(--texto-3)]">
                      {dataHora(vinculo.inicio)} · por {vinculo.criadoPor.nome}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>

        <div className="space-y-4">
          {/* 3.55 */}
          <Cartao
            titulo="Parâmetros de análise"
            descricao={`Pesos da recomendação de técnico · soma ${somaDosPesos(config)}`}
          >
            <FormularioParametros atuais={config} />
          </Cartao>

          <Cartao titulo="Cadastrar veículo">
            <FormularioVeiculo
              estoques={estoques.map((e) => ({ id: e.id, nome: e.nome }))}
            />
          </Cartao>

          <Cartao
            titulo="Lançar posição manualmente"
            descricao="Use quando o aparelho estiver sem sinal."
          >
            <FormularioPosicao
              rastreadores={rastreadores.map((r) => ({
                id: r.id,
                rotulo: r.alvo ? `${r.nome} — ${r.alvo}` : r.nome,
              }))}
            />
          </Cartao>

          <Cartao
            titulo={
              <span className="flex items-center gap-1.5">
                <Radio className="size-3.5" /> Integração do rastreador
              </span>
            }
          >
            <p className="text-sm text-[var(--texto-2)]">
              A sincronização puxa os aparelhos e as posições do Traccar:
            </p>
            <code className="mt-2 block overflow-x-auto rounded-md bg-[var(--superficie-3)] p-2 font-mono text-[11px]">
              npm run traccar -- --importar
              <br />
              npm run traccar -- --loop 60
            </code>
            <p className="mt-2 text-xs text-[var(--texto-3)]">
              A importação traz o aparelho e para aí — <em>o que</em> ele está
              rastreando é decisão humana, tomada na tabela ao lado. A plataforma
              mistura carro, celular e equipamento, e adivinhar por nome erraria o
              suficiente para alguém confiar num dado errado.
            </p>
            <Link
              href="/configuracoes"
              className="mt-2 inline-block text-xs font-medium text-[var(--acento)]"
            >
              Ver configurações do estoque
            </Link>
          </Cartao>
        </div>
      </div>
    </>
  );
}
