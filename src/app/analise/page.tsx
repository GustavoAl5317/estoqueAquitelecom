import Link from "next/link";
import { BrainCircuit, TrendingDown, TrendingUp } from "lucide-react";
import {
  analiseOperacional,
  anomalias,
  previsaoDeEstoque,
} from "@/lib/servicos/analise";
import { numero, percentual, quantidade } from "@/lib/utils";
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

export const dynamic = "force-dynamic";

/** 1.31 / 1.32 / 1.33 — previsão de duração, sugestão de compra e anomalias. */
export default async function Analise() {
  const [previsoes, deteccoes, leitura] = await Promise.all([
    previsaoDeEstoque(),
    anomalias(),
    analiseOperacional(),
  ]);

  const criticas = previsoes.filter((p) => p.risco === "CRITICO");
  const atencao = previsoes.filter((p) => p.risco === "ATENCAO");
  const compraTotal = previsoes.filter((p) => p.sugestaoCompra > 0).length;

  return (
    <>
      <CabecalhoPagina
        titulo="Análise e previsão"
        descricao="Estoque atual → consumo histórico → média diária → tendência → previsão. Tudo calculado localmente a partir do histórico real."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metrica
          rotulo="Acabam em 7 dias"
          valor={numero(criticas.length)}
          tom={criticas.length > 0 ? "critico" : "neutro"}
        />
        <Metrica
          rotulo="Acabam em 21 dias"
          valor={numero(atencao.length)}
          tom={atencao.length > 0 ? "atencao" : "neutro"}
        />
        <Metrica
          rotulo="Sugestões de compra"
          valor={numero(compraTotal)}
          tom="informativo"
        />
        <Metrica
          rotulo="Indicadores fora do padrão"
          valor={numero(deteccoes.length)}
          tom={deteccoes.length > 0 ? "roxo" : "neutro"}
        />
      </div>

      <Cartao
        className="mb-4"
        titulo={
          <span className="flex items-center gap-1.5">
            <BrainCircuit className="size-3.5" /> Leitura da operação
          </span>
        }
      >
        <ul className="space-y-2.5 text-sm text-[var(--texto-2)]">
          {leitura.map((linha, i) => (
            <li
              key={i}
              className={
                i === leitura.length - 1
                  ? "border-t border-[var(--borda)] pt-2.5 text-xs text-[var(--texto-3)]"
                  : ""
              }
            >
              {linha}
            </li>
          ))}
        </ul>
      </Cartao>

      <div className="grid gap-4 lg:grid-cols-5">
        <Cartao
          className="lg:col-span-3"
          titulo="Previsão de duração do estoque"
          descricao="Ordenado pelo que acaba primeiro"
          semPadding
        >
          {previsoes.length === 0 ? (
            <Vazio
              titulo="Sem consumo suficiente para prever"
              descricao="A previsão aparece assim que houver histórico de saídas."
            />
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Material</Th>
                  <Th numerico>Disponível</Th>
                  <Th numerico>Média/dia</Th>
                  <Th>Tendência</Th>
                  <Th numerico>Dura</Th>
                  <Th numerico>Comprar</Th>
                </tr>
              </thead>
              <tbody>
                {previsoes.slice(0, 20).map((previsao) => (
                  <Linha key={previsao.materialId}>
                    <Td>
                      <Link
                        href={`/materiais/${previsao.materialId}`}
                        className="font-medium hover:text-[var(--acento)]"
                      >
                        {previsao.nome}
                      </Link>
                    </Td>
                    <Td numerico>
                      {quantidade(previsao.disponivel, previsao.unidadeMedida)}
                    </Td>
                    <Td numerico>{numero(previsao.mediaDiaria, 2)}</Td>
                    <Td>
                      {Math.abs(previsao.tendencia) < 5 ? (
                        <span className="text-sm text-[var(--texto-3)]">estável</span>
                      ) : (
                        <span
                          className="flex items-center gap-1 text-sm"
                          style={{
                            color:
                              previsao.tendencia > 0
                                ? "var(--critico)"
                                : "var(--positivo)",
                          }}
                        >
                          {previsao.tendencia > 0 ? (
                            <TrendingUp className="size-3.5" />
                          ) : (
                            <TrendingDown className="size-3.5" />
                          )}
                          {percentual(Math.abs(previsao.tendencia))}
                        </span>
                      )}
                    </Td>
                    <Td numerico>
                      <Etiqueta
                        tom={
                          previsao.risco === "CRITICO"
                            ? "critico"
                            : previsao.risco === "ATENCAO"
                              ? "atencao"
                              : "positivo"
                        }
                      >
                        {previsao.diasRestantes ?? "—"} dias
                      </Etiqueta>
                    </Td>
                    <Td numerico className="font-medium">
                      {previsao.sugestaoCompra > 0
                        ? quantidade(previsao.sugestaoCompra, previsao.unidadeMedida)
                        : "—"}
                    </Td>
                  </Linha>
                ))}
              </tbody>
            </Tabela>
          )}
        </Cartao>

        <Cartao
          className="lg:col-span-2"
          titulo="Detecção de anomalias"
          descricao="Indicadores operacionais, não conclusões"
        >
          {deteccoes.length === 0 ? (
            <Vazio titulo="Nada fora do padrão" />
          ) : (
            <div className="space-y-3">
              {deteccoes.slice(0, 10).map((anomalia) => (
                <Aviso key={anomalia.id} tom="atencao" titulo={anomalia.titulo}>
                  {anomalia.detalhe}
                </Aviso>
              ))}
              <p className="pt-1 text-xs text-[var(--texto-3)]">
                Estes números apontam padrões que merecem verificação. Diferença de
                consumo entre técnicos e equipes depende do tipo de atendimento
                executado e não indica irregularidade por si só.
              </p>
            </div>
          )}
        </Cartao>
      </div>
    </>
  );
}
