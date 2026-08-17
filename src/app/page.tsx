import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeftRight,
  BrainCircuit,
  CircleSlash,
  PackageCheck,
  PackagePlus,
  Recycle,
  ShieldCheck,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import {
  BotaoLink,
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  Metrica,
  Vazio,
} from "@/components/ui";
import { GraficoEntradasSaidas, Ranking } from "@/components/graficos";
import {
  consumoPorDetentor,
  consumoPorMaterial,
  movimentacaoPorPeriodo,
  resumoDashboard,
} from "@/lib/servicos/consultas";
import { alertasDoEstoque } from "@/lib/servicos/alertas";
import { analiseOperacional } from "@/lib/servicos/analise";
import { moeda, moedaCompacta, numero, quantidade } from "@/lib/utils";

const PERIODOS = [
  { valor: 7, rotulo: "7 dias" },
  { valor: 30, rotulo: "30 dias" },
  { valor: 90, rotulo: "90 dias" },
];

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { periodo } = await searchParams;
  const dias = PERIODOS.some((p) => String(p.valor) === periodo)
    ? Number(periodo)
    : 30;

  const [resumo, serie, porMaterial, porTecnico, porEquipe, alertas, analise] =
    await Promise.all([
      resumoDashboard(),
      movimentacaoPorPeriodo(dias),
      consumoPorMaterial(dias, 6),
      consumoPorDetentor(dias, "TECNICO"),
      consumoPorDetentor(dias, "EQUIPE"),
      alertasDoEstoque(),
      analiseOperacional(),
    ]);

  return (
    <>
      <CabecalhoPagina
        titulo="Estoque"
        descricao="Onde está, com quem está, quanto temos e quando será preciso repor."
        acoes={
          <>
            <BotaoLink href="/entradas/nova" variante="secundario">
              <PackagePlus className="size-4" /> Nova entrada
            </BotaoLink>
            <BotaoLink href="/movimentacoes/nova" variante="primario">
              <ArrowLeftRight className="size-4" /> Nova movimentação
            </BotaoLink>
          </>
        }
      />

      {/* 1.18 — indicadores principais */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <Metrica
          rotulo="Valor total do estoque"
          valor={moedaCompacta(resumo.valorTotal)}
          detalhe={`${numero(resumo.totalMateriais)} materiais ativos`}
          icone={<Wallet className="size-4" />}
          tom="informativo"
        />
        <Metrica
          rotulo="Itens disponíveis"
          valor={numero(resumo.disponiveis)}
          detalhe={`${numero(resumo.reservado)} reservados`}
          icone={<PackageCheck className="size-4" />}
          tom="positivo"
          href="/materiais"
        />
        <Metrica
          rotulo="Com técnicos"
          valor={numero(resumo.emPosseTecnicos)}
          detalhe={`${numero(resumo.emPosseEquipes)} com equipes`}
          icone={<Users className="size-4" />}
          tom="roxo"
          href="/locais"
        />
        <Metrica
          rotulo="Aguardando devolução"
          valor={numero(resumo.aguardandoDevolucao)}
          detalhe="equipamentos retirados de clientes"
          icone={<Recycle className="size-4" />}
          tom="atencao"
          href="/triagem"
        />
        <Metrica
          rotulo="Em manutenção"
          valor={numero(resumo.emManutencao)}
          detalhe={`${numero(resumo.emTriagem)} em triagem`}
          icone={<Wrench className="size-4" />}
          tom="atencao"
          href="/triagem"
        />
        <Metrica
          rotulo="Estoque baixo"
          valor={numero(resumo.estoqueBaixo)}
          detalhe={`${numero(resumo.criticos)} em nível crítico`}
          icone={<AlertTriangle className="size-4" />}
          tom={resumo.criticos > 0 ? "critico" : "atencao"}
          href="/materiais?nivel=CRITICO"
        />
        <Metrica
          rotulo="Sem estoque"
          valor={numero(resumo.semEstoque)}
          detalhe="materiais zerados"
          icone={<CircleSlash className="size-4" />}
          tom={resumo.semEstoque > 0 ? "critico" : "neutro"}
          href="/materiais?nivel=SEM_ESTOQUE"
        />
        <Metrica
          rotulo="Aguardando recebimento"
          valor={numero(resumo.aguardandoRecebimento)}
          detalhe={`${numero(resumo.reservasAtivas)} reservas ativas`}
          icone={<ShieldCheck className="size-4" />}
          tom={resumo.aguardandoRecebimento > 0 ? "atencao" : "neutro"}
          href="/entradas"
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {/* 1.19 — entradas x saídas */}
        <Cartao
          className="lg:col-span-2"
          titulo="Entradas × Saídas"
          acoes={
            <div className="flex gap-1">
              {PERIODOS.map((p) => (
                <Link
                  key={p.valor}
                  href={`/?periodo=${p.valor}`}
                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                    p.valor === dias
                      ? "bg-[var(--acento-suave)] text-[var(--acento-texto)]"
                      : "text-[var(--texto-3)] hover:text-[var(--texto)]"
                  }`}
                >
                  {p.rotulo}
                </Link>
              ))}
            </div>
          }
        >
          <GraficoEntradasSaidas dados={serie} />
        </Cartao>

        {/* 1.31 — leitura automática do cenário */}
        <Cartao
          titulo={
            <span className="flex items-center gap-1.5">
              <BrainCircuit className="size-3.5" /> Análise de estoque
            </span>
          }
          acoes={
            <Link
              href="/analise"
              className="text-xs font-medium text-[var(--acento)]"
            >
              Ver previsão
            </Link>
          }
        >
          <ul className="space-y-2.5 text-sm text-[var(--texto-2)]">
            {analise.map((linha, i) => (
              <li
                key={i}
                className={
                  i === analise.length - 1
                    ? "border-t border-[var(--borda)] pt-2.5 text-xs text-[var(--texto-3)]"
                    : ""
                }
              >
                {linha}
              </li>
            ))}
          </ul>
        </Cartao>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* 1.20 */}
        <Cartao
          titulo="Materiais mais utilizados"
          descricao={`Últimos ${dias} dias`}
        >
          {porMaterial.length ? (
            <Ranking
              itens={porMaterial.map((m) => ({
                rotulo: m.nome,
                valor: m.quantidade,
                detalhe: moeda(m.valor),
              }))}
              sufixo={(v) => numero(v)}
            />
          ) : (
            <Vazio titulo="Nenhum consumo no período" />
          )}
        </Cartao>

        {/* 1.21 */}
        <Cartao titulo="Consumo por técnico" descricao={`Últimos ${dias} dias`}>
          {porTecnico.length ? (
            <Ranking
              itens={porTecnico.slice(0, 6).map((t) => ({
                rotulo: t.nome,
                valor: t.valor,
                cor: "var(--roxo)",
                detalhe: t.materiais
                  .slice(0, 3)
                  .map((m) => `${m.nome} ${quantidade(m.quantidade, m.unidade)}`)
                  .join(" · "),
              }))}
              sufixo={moeda}
            />
          ) : (
            <Vazio titulo="Nenhuma retirada no período" />
          )}
        </Cartao>

        {/* 1.22 */}
        <Cartao titulo="Consumo por equipe" descricao={`Últimos ${dias} dias`}>
          {porEquipe.length ? (
            <Ranking
              itens={porEquipe.map((e) => ({
                rotulo: e.nome,
                valor: e.valor,
                cor: "var(--positivo)",
              }))}
              sufixo={moeda}
            />
          ) : (
            <Vazio titulo="Nenhuma retirada por equipes no período" />
          )}
        </Cartao>
      </div>

      {/* 1.17 */}
      <Cartao
        className="mt-4"
        titulo="Alertas do estoque"
        descricao={`${alertas.length} situação(ões) exigindo atenção`}
        acoes={
          <Link href="/alertas" className="text-xs font-medium text-[var(--acento)]">
            Ver todos
          </Link>
        }
        semPadding
      >
        {alertas.length === 0 ? (
          <Vazio
            titulo="Nenhum alerta aberto"
            descricao="Nenhum material abaixo do mínimo, devolução pendente ou consumo fora do padrão."
          />
        ) : (
          <ul className="divide-y divide-[var(--borda)]">
            {alertas.slice(0, 6).map((alerta) => (
              <li key={alerta.id}>
                <Link
                  href={alerta.href ?? "/alertas"}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-[var(--superficie-2)]"
                >
                  <Etiqueta
                    tom={
                      alerta.severidade === "CRITICO"
                        ? "critico"
                        : alerta.severidade === "ATENCAO"
                          ? "atencao"
                          : "informativo"
                    }
                    ponto
                  >
                    {alerta.severidade === "CRITICO"
                      ? "Crítico"
                      : alerta.severidade === "ATENCAO"
                        ? "Atenção"
                        : "Info"}
                  </Etiqueta>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{alerta.titulo}</span>
                    <span className="block text-xs text-[var(--texto-3)]">
                      {alerta.detalhe}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </>
  );
}
