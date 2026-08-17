import { prisma } from "@/lib/prisma";
import {
  ESTADO_FISICO,
  MOVIMENTOS_DE_CONSUMO,
  NIVEL_ESTOQUE,
  STATUS_SERIAL,
  TIPO_ENTRADA,
  TIPO_MOVIMENTACAO,
} from "@/lib/dominio";
import { dataHora, diasAtras, numero } from "@/lib/utils";
import { consumoPorDetentor, saldosConsolidados } from "./consultas";

/**
 * 1.30 — RELATÓRIOS.
 * Cada relatório é uma função que devolve cabeçalho + linhas, o que permite
 * renderizar em tela e exportar em CSV com o mesmo código.
 */
export type Relatorio = {
  id: string;
  nome: string;
  descricao: string;
  /** aceita recorte por período */
  periodo?: boolean;
  carregar: (dias: number) => Promise<{ colunas: string[]; linhas: string[][] }>;
};

const texto = (valor: unknown) =>
  valor === null || valor === undefined ? "" : String(valor);

export const RELATORIOS: Relatorio[] = [
  {
    id: "estoque-atual",
    nome: "Estoque atual",
    descricao: "Saldo consolidado por material, com nível de criticidade e valor.",
    async carregar() {
      const dados = await saldosConsolidados();
      return {
        colunas: [
          "Código",
          "Material",
          "Categoria",
          "Unidade",
          "Em estoque",
          "Com técnicos",
          "Com equipes",
          "Reservado",
          "Disponível",
          "Mínimo",
          "Nível",
          "Valor total",
        ],
        linhas: dados.map((m) => [
          m.codigoInterno,
          m.nome,
          m.categoria,
          m.unidadeMedida,
          numero(m.emEstoque, 2),
          numero(m.emPosseTecnicos, 2),
          numero(m.emPosseEquipes, 2),
          numero(m.reservado, 2),
          numero(m.disponivel, 2),
          numero(m.quantidadeMinima, 2),
          NIVEL_ESTOQUE.rotulo(m.nivel),
          numero(m.valorTotal, 2),
        ]),
      };
    },
  },

  {
    id: "estoque-minimo",
    nome: "Materiais abaixo do mínimo",
    descricao: "Itens que precisam de reposição imediata.",
    async carregar() {
      const dados = (await saldosConsolidados()).filter(
        (m) => m.disponivel < m.quantidadeMinima || m.nivel === "SEM_ESTOQUE",
      );
      return {
        colunas: [
          "Código",
          "Material",
          "Categoria",
          "Disponível",
          "Mínimo",
          "Ideal",
          "Falta",
          "Nível",
        ],
        linhas: dados.map((m) => [
          m.codigoInterno,
          m.nome,
          m.categoria,
          numero(m.disponivel, 2),
          numero(m.quantidadeMinima, 2),
          numero(m.quantidadeIdeal, 2),
          numero(Math.max(0, m.quantidadeMinima - m.disponivel), 2),
          NIVEL_ESTOQUE.rotulo(m.nivel),
        ]),
      };
    },
  },

  {
    id: "entradas",
    nome: "Entradas",
    descricao: "Entradas lançadas no período, com status de recebimento.",
    periodo: true,
    async carregar(dias) {
      const entradas = await prisma.entrada.findMany({
        where: { criadoEm: { gte: diasAtras(dias) } },
        include: {
          destino: true,
          fornecedor: true,
          criadoPor: true,
          recebidoPor: true,
          itens: { include: { material: true } },
        },
        orderBy: { criadoEm: "desc" },
      });
      return {
        colunas: [
          "Número",
          "Data",
          "Tipo",
          "Destino",
          "Fornecedor",
          "Documento",
          "Material",
          "Previsto",
          "Recebido",
          "Status",
          "Lançou",
          "Recebeu",
        ],
        linhas: entradas.flatMap((entrada) =>
          entrada.itens.map((item) => [
            entrada.numero,
            dataHora(entrada.criadoEm),
            TIPO_ENTRADA.rotulo(entrada.tipo),
            entrada.destino.nome,
            texto(entrada.fornecedor?.nome),
            texto(entrada.documento),
            item.material.nome,
            numero(item.quantidadePrevista, 2),
            item.quantidadeRecebida === null
              ? ""
              : numero(item.quantidadeRecebida, 2),
            entrada.status,
            entrada.criadoPor.nome,
            texto(entrada.recebidoPor?.nome),
          ]),
        ),
      };
    },
  },

  {
    id: "saidas",
    nome: "Saídas e movimentações",
    descricao: "Todo material que saiu, para quem e por quê.",
    periodo: true,
    async carregar(dias) {
      const movimentacoes = await prisma.movimentacao.findMany({
        where: { criadoEm: { gte: diasAtras(dias) } },
        include: {
          origem: true,
          destino: true,
          responsavel: true,
          solicitante: true,
          itens: { include: { material: true } },
        },
        orderBy: { criadoEm: "desc" },
      });
      return {
        colunas: [
          "Número",
          "Data",
          "Tipo",
          "Finalidade",
          "Origem",
          "Destino",
          "Material",
          "Quantidade",
          "Estado",
          "Responsável",
          "Solicitante",
          "Motivo",
        ],
        linhas: movimentacoes.flatMap((m) =>
          m.itens.map((item) => [
            m.numero,
            dataHora(m.criadoEm),
            TIPO_MOVIMENTACAO.rotulo(m.tipo),
            m.finalidade,
            texto(m.origem?.nome),
            texto(m.destino?.nome),
            item.material.nome,
            numero(item.quantidade, 2),
            texto(item.estadoFisico),
            m.responsavel.nome,
            texto(m.solicitante?.nome),
            texto(m.motivo),
          ]),
        ),
      };
    },
  },

  {
    id: "materiais-por-tecnico",
    nome: "Materiais por técnico",
    descricao: "O que cada técnico tem em posse neste momento.",
    async carregar() {
      const saldos = await prisma.saldo.findMany({
        where: { quantidade: { gt: 0 }, detentor: { tipo: "TECNICO" } },
        include: { material: true, detentor: { include: { tecnico: true } } },
        orderBy: [{ detentor: { nome: "asc" } }, { material: { nome: "asc" } }],
      });
      return {
        colunas: [
          "Técnico",
          "Matrícula",
          "Material",
          "Categoria",
          "Quantidade",
          "Unidade",
          "Valor",
        ],
        linhas: saldos.map((s) => [
          s.detentor.nome,
          texto(s.detentor.tecnico?.matricula),
          s.material.nome,
          "",
          numero(s.quantidade, 2),
          s.material.unidadeMedida,
          numero(s.quantidade * s.material.valorMedio, 2),
        ]),
      };
    },
  },

  {
    id: "materiais-por-equipe",
    nome: "Materiais por equipe",
    descricao: "O que cada equipe tem em posse neste momento.",
    async carregar() {
      const saldos = await prisma.saldo.findMany({
        where: { quantidade: { gt: 0 }, detentor: { tipo: "EQUIPE" } },
        include: { material: true, detentor: true },
        orderBy: [{ detentor: { nome: "asc" } }, { material: { nome: "asc" } }],
      });
      return {
        colunas: ["Equipe", "Material", "Quantidade", "Unidade", "Valor"],
        linhas: saldos.map((s) => [
          s.detentor.nome,
          s.material.nome,
          numero(s.quantidade, 2),
          s.material.unidadeMedida,
          numero(s.quantidade * s.material.valorMedio, 2),
        ]),
      };
    },
  },

  {
    id: "consumo-tecnico",
    nome: "Consumo por técnico",
    descricao: "Quanto cada técnico retirou no período, em quantidade e valor.",
    periodo: true,
    async carregar(dias) {
      const dados = await consumoPorDetentor(dias, "TECNICO");
      return {
        colunas: ["Técnico", "Itens retirados", "Valor", "Principais materiais"],
        linhas: dados.map((d) => [
          d.nome,
          numero(d.total, 2),
          numero(d.valor, 2),
          d.materiais
            .map((m) => `${m.nome} (${numero(m.quantidade, 2)} ${m.unidade})`)
            .join("; "),
        ]),
      };
    },
  },

  {
    id: "consumo-equipe",
    nome: "Consumo por equipe",
    descricao: "Consumo agregado por equipe no período.",
    periodo: true,
    async carregar(dias) {
      const dados = await consumoPorDetentor(dias, "EQUIPE");
      return {
        colunas: ["Equipe", "Itens retirados", "Valor", "Principais materiais"],
        linhas: dados.map((d) => [
          d.nome,
          numero(d.total, 2),
          numero(d.valor, 2),
          d.materiais
            .map((m) => `${m.nome} (${numero(m.quantidade, 2)} ${m.unidade})`)
            .join("; "),
        ]),
      };
    },
  },

  {
    id: "consumo-material",
    nome: "Consumo por material",
    descricao: "Ranking de materiais mais utilizados no período.",
    periodo: true,
    async carregar(dias) {
      const movimentos = await prisma.movimento.findMany({
        where: {
          criadoEm: { gte: diasAtras(dias) },
          tipo: { in: MOVIMENTOS_DE_CONSUMO },
        },
        include: { material: true },
      });

      const mapa = new Map<
        string,
        { nome: string; codigo: string; unidade: string; qtd: number; valor: number }
      >();
      for (const m of movimentos) {
        const atual = mapa.get(m.materialId) ?? {
          nome: m.material.nome,
          codigo: m.material.codigoInterno,
          unidade: m.material.unidadeMedida,
          qtd: 0,
          valor: 0,
        };
        atual.qtd += m.quantidade;
        atual.valor += m.quantidade * (m.valorUnitario ?? m.material.valorMedio);
        mapa.set(m.materialId, atual);
      }

      return {
        colunas: ["Código", "Material", "Unidade", "Consumo", "Valor"],
        linhas: [...mapa.values()]
          .sort((a, b) => b.qtd - a.qtd)
          .map((m) => [
            m.codigo,
            m.nome,
            m.unidade,
            numero(m.qtd, 2),
            numero(m.valor, 2),
          ]),
      };
    },
  },

  {
    id: "serializados",
    nome: "Equipamentos serializados",
    descricao: "Todas as unidades individuais com status e localização.",
    async carregar() {
      const unidades = await prisma.unidadeSerial.findMany({
        include: { material: true, detentor: true },
        orderBy: [{ material: { nome: "asc" } }, { serial: "asc" }],
      });
      return {
        colunas: [
          "Serial",
          "MAC",
          "Patrimônio",
          "Material",
          "Status",
          "Estado",
          "Onde está",
          "Cliente",
          "Atualizado",
        ],
        linhas: unidades.map((u) => [
          u.serial,
          texto(u.macAddress),
          texto(u.patrimonio),
          u.material.nome,
          STATUS_SERIAL.rotulo(u.status),
          ESTADO_FISICO.rotulo(u.estadoFisico),
          texto(u.detentor?.nome),
          texto(u.clienteRef),
          dataHora(u.atualizadoEm),
        ]),
      };
    },
  },

  {
    id: "aguardando-devolucao",
    nome: "Aguardando devolução",
    descricao: "Equipamentos retirados de clientes ainda em posse de técnicos.",
    async carregar() {
      const unidades = await prisma.unidadeSerial.findMany({
        where: { status: "AGUARDANDO_DEVOLUCAO" },
        include: { material: true, detentor: true },
        orderBy: { atualizadoEm: "asc" },
      });
      return {
        colunas: ["Serial", "Material", "Com quem está", "Estado", "Desde", "Dias"],
        linhas: unidades.map((u) => [
          u.serial,
          u.material.nome,
          texto(u.detentor?.nome),
          ESTADO_FISICO.rotulo(u.estadoFisico),
          dataHora(u.atualizadoEm),
          String(
            Math.floor((Date.now() - u.atualizadoEm.getTime()) / 86_400_000),
          ),
        ]),
      };
    },
  },

  {
    id: "manutencao",
    nome: "Materiais em manutenção",
    descricao: "Equipamentos na bancada aguardando conserto.",
    async carregar() {
      const unidades = await prisma.unidadeSerial.findMany({
        where: { status: { in: ["EM_MANUTENCAO", "EM_TRIAGEM", "DEFEITUOSO"] } },
        include: { material: true, detentor: true },
        orderBy: { atualizadoEm: "asc" },
      });
      return {
        colunas: ["Serial", "Material", "Status", "Estado", "Local", "Desde"],
        linhas: unidades.map((u) => [
          u.serial,
          u.material.nome,
          STATUS_SERIAL.rotulo(u.status),
          ESTADO_FISICO.rotulo(u.estadoFisico),
          texto(u.detentor?.nome),
          dataHora(u.atualizadoEm),
        ]),
      };
    },
  },

  {
    id: "perdidos-defeituosos",
    nome: "Perdidos, defeituosos e sucata",
    descricao: "Equipamentos que saíram do ciclo produtivo.",
    async carregar() {
      const unidades = await prisma.unidadeSerial.findMany({
        where: { status: { in: ["PERDIDO", "SUCATA", "BAIXADO", "DEFEITUOSO"] } },
        include: { material: true },
        orderBy: { atualizadoEm: "desc" },
      });
      return {
        colunas: ["Serial", "Material", "Status", "Estado", "Valor", "Baixado em"],
        linhas: unidades.map((u) => [
          u.serial,
          u.material.nome,
          STATUS_SERIAL.rotulo(u.status),
          ESTADO_FISICO.rotulo(u.estadoFisico),
          numero(u.valorUnitario ?? u.material.valorMedio, 2),
          dataHora(u.atualizadoEm),
        ]),
      };
    },
  },

  {
    id: "divergencias",
    nome: "Divergências de recebimento",
    descricao: "Diferenças entre o previsto e o recebido, com motivo.",
    periodo: true,
    async carregar(dias) {
      const divergencias = await prisma.divergencia.findMany({
        where: { criadoEm: { gte: diasAtras(dias) } },
        include: {
          usuario: true,
          entradaItem: {
            include: { material: true, entrada: { include: { fornecedor: true } } },
          },
        },
        orderBy: { criadoEm: "desc" },
      });
      return {
        colunas: [
          "Entrada",
          "Data",
          "Fornecedor",
          "Material",
          "Previsto",
          "Recebido",
          "Diferença",
          "Motivo",
          "Responsável",
        ],
        linhas: divergencias.map((d) => [
          d.entradaItem.entrada.numero,
          dataHora(d.criadoEm),
          texto(d.entradaItem.entrada.fornecedor?.nome),
          d.entradaItem.material.nome,
          numero(d.previsto, 2),
          numero(d.recebido, 2),
          numero(d.diferenca, 2),
          d.motivo,
          d.usuario.nome,
        ]),
      };
    },
  },

  {
    id: "triagem",
    nome: "Logística reversa",
    descricao: "Itens devolvidos, laudo e destino dado a cada um.",
    periodo: true,
    async carregar(dias) {
      const triagens = await prisma.triagem.findMany({
        where: { criadoEm: { gte: diasAtras(dias) } },
        include: {
          material: true,
          unidade: true,
          responsavel: true,
          destino: true,
          origemMovimentacao: { include: { origem: true } },
        },
        orderBy: { criadoEm: "desc" },
      });
      return {
        colunas: [
          "Material",
          "Serial",
          "Devolvido por",
          "Estado recebido",
          "Situação",
          "Resultado",
          "Destino",
          "Laudo",
          "Entrada na fila",
          "Conclusão",
        ],
        linhas: triagens.map((t) => [
          t.material.nome,
          texto(t.unidade?.serial),
          texto(t.origemMovimentacao?.origem?.nome),
          texto(t.estadoRecebido && ESTADO_FISICO.rotulo(t.estadoRecebido)),
          t.status,
          texto(t.resultado),
          texto(t.destino?.nome),
          texto(t.laudo),
          dataHora(t.criadoEm),
          t.concluidoEm ? dataHora(t.concluidoEm) : "",
        ]),
      };
    },
  },

  {
    id: "inventarios",
    nome: "Inventários",
    descricao: "Contagens realizadas e divergências encontradas.",
    periodo: true,
    async carregar(dias) {
      const inventarios = await prisma.inventario.findMany({
        where: { iniciadoEm: { gte: diasAtras(dias) } },
        include: {
          detentor: true,
          iniciadoPor: true,
          itens: { include: { material: true } },
        },
        orderBy: { iniciadoEm: "desc" },
      });
      return {
        colunas: [
          "Inventário",
          "Local",
          "Material",
          "Sistema",
          "Contagem",
          "Diferença",
          "Ajustado",
          "Status",
          "Data",
        ],
        linhas: inventarios.flatMap((inv) =>
          inv.itens.map((item) => [
            inv.numero,
            inv.detentor.nome,
            item.material.nome,
            numero(item.quantidadeSistema, 2),
            item.quantidadeContada === null
              ? ""
              : numero(item.quantidadeContada, 2),
            item.diferenca === null ? "" : numero(item.diferenca, 2),
            item.ajustado ? "sim" : "não",
            inv.status,
            dataHora(inv.iniciadoEm),
          ]),
        ),
      };
    },
  },
];

export function relatorioPorId(id: string) {
  return RELATORIOS.find((r) => r.id === id);
}

/** CSV com separador ponto e vírgula e BOM, para abrir direto no Excel pt-BR. */
export function montarCsv(colunas: string[], linhas: string[][]) {
  const escapar = (valor: string) =>
    /[";\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;

  const conteudo = [colunas, ...linhas]
    .map((linha) => linha.map((celula) => escapar(celula ?? "")).join(";"))
    .join("\r\n");

  return `﻿${conteudo}`;
}
