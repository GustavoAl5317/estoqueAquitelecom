import Link from "next/link";
import { Radio } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { TIPOS_ESTOQUE_SISTEMA } from "@/lib/dominio";
import { situacaoDaFrota, vinculosRecentes } from "@/lib/servicos/frota";
import { parametros, somaDosPesos } from "@/lib/servicos/parametros";
import { dataHora, numero, tempoRelativo } from "@/lib/utils";
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
} from "@/components/central-controle";

export const dynamic = "force-dynamic";

/**
 * 3.30 — CENTRAL DE CONTROLE.
 *
 * Reúne o que a supervisão precisa para decidir: onde estão os veículos, quem
 * está dirigindo cada um, e com que pesos o sistema recomenda técnico.
 */
export default async function Central() {
  const [frota, vinculos, tecnicos, estoques, config, ingestaoAtiva] =
    await Promise.all([
      situacaoDaFrota(),
      vinculosRecentes(12),
      prisma.tecnico.findMany({
        where: { ativo: true },
        include: { equipe: true },
        orderBy: { nome: "asc" },
      }),
      prisma.estoque.findMany({
        where: { tipo: { notIn: TIPOS_ESTOQUE_SISTEMA }, status: "ATIVO" },
        orderBy: { nome: "asc" },
      }),
      parametros(),
      Promise.resolve(Boolean(process.env.RASTREADOR_SEGREDO)),
    ]);

  const comTecnico = frota.filter((v) => v.tecnicoId).length;
  const comPosicao = frota.filter((v) => v.latitude !== null).length;
  const desatualizados = frota.filter(
    (v) => v.frescor === "DESATUALIZADA" || v.frescor === "SEM_SINAL",
  ).length;
  const semVinculo = frota.filter((v) => v.ativo && !v.tecnicoId).length;

  const pontos: PontoMapa[] = [
    ...frota
      .filter((v) => v.latitude !== null && v.longitude !== null)
      .map<PontoMapa>((v) => ({
        id: v.id,
        rotulo: v.tecnicoNome ?? v.placa,
        detalhe: v.tecnicoNome ? v.placa : "sem técnico",
        latitude: v.latitude!,
        longitude: v.longitude!,
        tipo: "VEICULO",
        tom:
          v.frescor === "ATUAL"
            ? "ok"
            : v.frescor === "RECENTE"
              ? "ok"
              : v.frescor === "DESATUALIZADA"
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

  const somaPesos = somaDosPesos(config);

  return (
    <>
      <CabecalhoPagina
        titulo="Central de Controle"
        descricao="Onde a frota está, quem está com cada veículo e com que critérios o sistema recomenda técnico."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metrica rotulo="Veículos" valor={numero(frota.length)} />
        <Metrica
          rotulo="Com técnico definido"
          valor={`${comTecnico}/${frota.length}`}
          tom={semVinculo > 0 ? "atencao" : "positivo"}
          detalhe={semVinculo > 0 ? `${semVinculo} sem vínculo` : "todos vinculados"}
        />
        <Metrica
          rotulo="Reportando posição"
          valor={`${comPosicao}/${frota.length}`}
          tom={comPosicao === 0 ? "critico" : "informativo"}
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
            aceita dados depois que <code className="font-mono text-xs">RASTREADOR_SEGREDO</code>{" "}
            for definido no <code className="font-mono text-xs">.env</code>. Até lá,
            a posição pode ser lançada manualmente.
          </Aviso>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Cartao titulo="Mapa operacional" descricao="Posição relativa da frota e dos estoques">
            <MapaOperacional pontos={pontos} />
          </Cartao>

          <Cartao
            titulo="Frota e vínculo com técnico"
            descricao="Trocar o motorista aqui é o que faz a posição do carro virar posição do técnico."
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
            descricao={`Pesos da recomendação de técnico · soma ${somaPesos}`}
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
            descricao="Use quando o rastreador estiver sem sinal."
          >
            <FormularioPosicao
              veiculos={frota.map((v) => ({ id: v.id, placa: v.placa }))}
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
              A plataforma de rastreamento envia as posições para:
            </p>
            <code className="mt-2 block overflow-x-auto rounded-md bg-[var(--superficie-3)] p-2 font-mono text-[11px]">
              POST /api/rastreador
              <br />
              x-rastreador-segredo: •••
              <br />
              {`{ "rastreador": "100001", "lat": -3.73, "lng": -38.57 }`}
            </code>
            <p className="mt-2 text-xs text-[var(--texto-3)]">
              Aceita um objeto ou uma lista, e identifica o veículo por{" "}
              <code className="font-mono">rastreador</code>,{" "}
              <code className="font-mono">placa</code> ou{" "}
              <code className="font-mono">veiculoId</code>. O campo{" "}
              <em>ID no rastreador</em> do cadastro é o que faz a amarração.
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
