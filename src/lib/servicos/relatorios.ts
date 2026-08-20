import { prisma } from "@/lib/prisma";
import {
  ESTADO_FISICO,
  MOVIMENTOS_DE_CONSUMO,
  NIVEL_ESTOQUE,
  SEVERIDADE_OS,
  SITUACAO_SLA,
  STATUS_OS,
  STATUS_OS_ABERTOS,
  STATUS_SERIAL,
  TIPO_ENTRADA,
  TIPO_MOVIMENTACAO,
} from "@/lib/dominio";
import { rotuloDoTipo, todosTiposOS } from "./tipos-os";
import { dataHora, diasAtras, numero } from "@/lib/utils";
import { consumoPorDetentor, saldosConsolidados } from "./consultas";
import {
  listarOrdens,
  listarOrdensComMaterial,
  prazoLegivel,
  situacaoSla,
} from "./ordens";
import { minutosLegiveis, temposDaOrdem, temposMedios } from "./eventos";
import { possiveisIncidentes, reincidencias } from "./incidentes";
import { deslocamentoDoTecnico } from "./localizacao";

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


// ---------------------------------------------------------------------------
// 2.49 / 3.68 — RELATÓRIOS DE ORDEM DE SERVIÇO E DESLOCAMENTO
//
// Mesmo contrato dos relatórios de estoque: cabeçalho + linhas, renderizados em
// tela e exportados em CSV pelo mesmo código.
// ---------------------------------------------------------------------------

const RELATORIOS_OS: Relatorio[] = [
  {
    id: "os-abertas",
    nome: "Ordens em aberto",
    descricao:
      "Tudo que ainda consome capacidade da operação, com prazo e responsável.",
    async carregar() {
      const [ordens, tipos] = await Promise.all([
        listarOrdens({ status: STATUS_OS_ABERTOS, limite: 500 }),
        todosTiposOS(),
      ]);
      return {
        colunas: [
          "OS",
          "Cliente",
          "Tipo",
          "Subtipo",
          "Prioridade",
          "Severidade",
          "Situação",
          "Bairro",
          "Responsável",
          "Aberta em",
          "Prazo",
          "Situação do prazo",
        ],
        linhas: ordens.map((o) => [
          o.numero,
          texto(o.cliente),
          rotuloDoTipo(tipos, o.tipo),
          texto(o.subtipo),
          o.prioridade,
          SEVERIDADE_OS.rotulo(o.severidade),
          STATUS_OS.rotulo(o.status),
          texto(o.bairro?.nome ?? o.bairroNome),
          texto(o.tecnico?.nome),
          dataHora(o.abertaEm),
          o.prazo ? dataHora(o.prazo) : "",
          SITUACAO_SLA.rotulo(o.situacao),
        ]),
      };
    },
  },

  {
    id: "os-concluidas",
    nome: "Ordens concluídas",
    descricao: "Atendimentos encerrados no período, com tempo total e SLA.",
    periodo: true,
    async carregar(dias) {
      const [ordens, tipos] = await Promise.all([
        prisma.ordemServico.findMany({
          where: { concluidaEm: { gte: diasAtras(dias) } },
          include: {
            tecnico: { select: { nome: true } },
            equipe: { select: { nome: true } },
            eventos: {
              select: { tipo: true, status: true, ocorreuEm: true },
              orderBy: { ocorreuEm: "asc" },
            },
          },
          orderBy: { concluidaEm: "desc" },
        }),
        todosTiposOS(),
      ]);

      return {
        colunas: [
          "OS",
          "Cliente",
          "Tipo",
          "Bairro",
          "Responsável",
          "Equipe",
          "Aberta em",
          "Concluída em",
          "Até atribuição",
          "Deslocamento",
          "Atendimento",
          "Total",
          "SLA",
        ],
        linhas: ordens.map((o) => {
          const tempos = temposDaOrdem(o, o.eventos);
          return [
            o.numero,
            texto(o.cliente),
            rotuloDoTipo(tipos, o.tipo),
            texto(o.bairroNome),
            texto(o.tecnico?.nome),
            texto(o.equipe?.nome),
            dataHora(o.abertaEm),
            o.concluidaEm ? dataHora(o.concluidaEm) : "",
            minutosLegiveis(tempos.ateAtribuicao),
            minutosLegiveis(tempos.emDeslocamento),
            minutosLegiveis(tempos.emAtendimento),
            minutosLegiveis(tempos.total),
            SITUACAO_SLA.rotulo(situacaoSla(o).situacao),
          ];
        }),
      };
    },
  },

  {
    id: "os-atrasadas",
    nome: "Ordens atrasadas",
    descricao: "Abertas com o prazo já vencido — o que precisa de explicação.",
    async carregar() {
      const [ordens, tipos] = await Promise.all([
        listarOrdens({
          status: STATUS_OS_ABERTOS,
          somenteRisco: true,
          limite: 500,
        }),
        todosTiposOS(),
      ]);
      const atrasadas = ordens.filter((o) => o.situacao === "ESTOURADO");

      return {
        colunas: [
          "OS",
          "Cliente",
          "Tipo",
          "Bairro",
          "Responsável",
          "Prazo",
          "Atraso",
          "Aberta há",
        ],
        linhas: atrasadas.map((o) => [
          o.numero,
          texto(o.cliente),
          rotuloDoTipo(tipos, o.tipo),
          texto(o.bairro?.nome ?? o.bairroNome),
          texto(o.tecnico?.nome ?? "sem responsável"),
          o.prazo ? dataHora(o.prazo) : "",
          prazoLegivel(o.minutosRestantes),
          minutosLegiveis(
            Math.round((Date.now() - o.abertaEm.getTime()) / 60_000),
          ),
        ]),
      };
    },
  },

  {
    id: "os-por-tecnico",
    nome: "Ordens por técnico",
    descricao: "Carga atual e produção no período, por profissional.",
    periodo: true,
    async carregar(dias) {
      const desde = diasAtras(dias);
      const tecnicos = await prisma.tecnico.findMany({
        where: { ativo: true },
        include: {
          equipe: { select: { nome: true } },
          ordens: {
            where: { OR: [{ abertaEm: { gte: desde } }, { status: { in: STATUS_OS_ABERTOS } }] },
            select: {
              status: true,
              prioridade: true,
              prazo: true,
              concluidaEm: true,
              abertaEm: true,
            },
          },
        },
        orderBy: { nome: "asc" },
      });

      return {
        colunas: [
          "Técnico",
          "Matrícula",
          "Equipe",
          "Situação",
          "Em aberto",
          "Emergenciais",
          "Em risco",
          "Concluídas no período",
          "SLA cumprido",
        ],
        linhas: tecnicos.map((t) => {
          const abertas = t.ordens.filter((o) => STATUS_OS_ABERTOS.includes(o.status));
          const concluidas = t.ordens.filter(
            (o) => o.status === "CONCLUIDA" && o.concluidaEm && o.concluidaEm >= desde,
          );
          const comPrazo = concluidas.filter((o) => o.prazo);
          const noPrazo = comPrazo.filter(
            (o) => situacaoSla(o).situacao === "CONCLUIDA_NO_PRAZO",
          );

          return [
            t.nome,
            t.matricula,
            texto(t.equipe?.nome),
            t.status.replaceAll("_", " ").toLowerCase(),
            String(abertas.length),
            String(abertas.filter((o) => o.prioridade === "P1").length),
            String(
              abertas.filter((o) => {
                const s = situacaoSla(o).situacao;
                return s === "ESTOURADO" || s === "ATENCAO";
              }).length,
            ),
            String(concluidas.length),
            comPrazo.length
              ? `${Math.round((noPrazo.length / comPrazo.length) * 100)}%`
              : "",
          ];
        }),
      };
    },
  },

  {
    id: "os-por-bairro",
    nome: "Ordens por bairro",
    descricao: "Distribuição territorial da demanda e cobertura de responsável.",
    periodo: true,
    async carregar(dias) {
      const desde = diasAtras(dias);
      const [bairros, tiposOS] = await Promise.all([
        prisma.bairro.findMany({
          include: {
            regiao: { select: { nome: true } },
            responsavelPrincipal: { select: { nome: true } },
            responsavelSecundario: { select: { nome: true } },
            ordens: {
              where: { abertaEm: { gte: desde } },
              select: {
                status: true,
                tipo: true,
                prazo: true,
                concluidaEm: true,
                abertaEm: true,
              },
            },
          },
          orderBy: { nome: "asc" },
        }),
        todosTiposOS(),
      ]);

      return {
        colunas: [
          "Bairro",
          "Cidade",
          "Região",
          "Responsável",
          "Reserva",
          "OS no período",
          "Em aberto",
          "Tipo predominante",
          "Concluídas",
        ],
        linhas: bairros.map((b) => {
          const tipos = new Map<string, number>();
          for (const ordem of b.ordens) {
            tipos.set(ordem.tipo, (tipos.get(ordem.tipo) ?? 0) + 1);
          }
          const predominante = [...tipos.entries()].sort((a, c) => c[1] - a[1])[0];

          return [
            b.nome,
            b.cidade,
            texto(b.regiao?.nome),
            texto(b.responsavelPrincipal?.nome ?? "não definido"),
            texto(b.responsavelSecundario?.nome),
            String(b.ordens.length),
            String(b.ordens.filter((o) => STATUS_OS_ABERTOS.includes(o.status)).length),
            predominante ? rotuloDoTipo(tiposOS, predominante[0]) : "",
            String(b.ordens.filter((o) => o.status === "CONCLUIDA").length),
          ];
        }),
      };
    },
  },

  {
    id: "os-tempo-medio",
    nome: "Tempo médio por etapa",
    descricao:
      "Quanto leva atribuir, deslocar e atender — por tipo de ordem (2.41).",
    periodo: true,
    async carregar(dias) {
      const [medias, tipos] = await Promise.all([
        temposMedios(dias),
        todosTiposOS(),
      ]);
      return {
        colunas: [
          "Tipo",
          "Concluídas",
          "Até atribuição",
          "Deslocamento",
          "Atendimento",
          "Total",
        ],
        linhas: [
          [
            "TODOS OS TIPOS",
            String(medias.concluidas),
            minutosLegiveis(medias.ateAtribuicao),
            minutosLegiveis(medias.emDeslocamento),
            minutosLegiveis(medias.emAtendimento),
            minutosLegiveis(medias.total),
          ],
          ...medias.porTipo.map((linha) => [
            rotuloDoTipo(tipos, linha.tipo),
            String(linha.quantidade),
            minutosLegiveis(linha.ateAtribuicao),
            minutosLegiveis(linha.emDeslocamento),
            minutosLegiveis(linha.emAtendimento),
            minutosLegiveis(linha.total),
          ]),
        ],
      };
    },
  },

  {
    id: "os-reincidencia",
    nome: "Clientes reincidentes",
    descricao:
      "Quem voltou a abrir chamado — sinal de problema que não foi resolvido (2.25).",
    periodo: true,
    async carregar(dias) {
      const [lista, tipos] = await Promise.all([
        reincidencias(dias, 2),
        todosTiposOS(),
      ]);
      return {
        colunas: [
          "Cliente",
          "Contrato",
          "OS no período",
          "Ainda abertas",
          "Tipos",
          "Última abertura",
        ],
        linhas: lista.map((r) => [
          r.cliente,
          texto(r.contrato),
          String(r.ordens),
          String(r.abertas),
          r.tipos
            .map((t) => `${rotuloDoTipo(tipos, t.tipo)} (${t.quantidade})`)
            .join(", "),
          dataHora(r.ultimaEm),
        ]),
      };
    },
  },

  {
    id: "os-sla",
    nome: "Aderência ao SLA",
    descricao: "Cumprimento de prazo por tipo de ordem no período.",
    periodo: true,
    async carregar(dias) {
      const [ordens, tipos] = await Promise.all([
        prisma.ordemServico.findMany({
          where: { concluidaEm: { gte: diasAtras(dias) }, prazo: { not: null } },
          select: {
            tipo: true,
            prazo: true,
            concluidaEm: true,
            status: true,
            abertaEm: true,
          },
        }),
        todosTiposOS(),
      ]);

      const porTipo = new Map<string, { total: number; noPrazo: number }>();
      for (const ordem of ordens) {
        const atual = porTipo.get(ordem.tipo) ?? { total: 0, noPrazo: 0 };
        atual.total += 1;
        if (situacaoSla(ordem).situacao === "CONCLUIDA_NO_PRAZO") atual.noPrazo += 1;
        porTipo.set(ordem.tipo, atual);
      }

      const total = ordens.length;
      const noPrazo = [...porTipo.values()].reduce((s, v) => s + v.noPrazo, 0);

      return {
        colunas: ["Tipo", "Concluídas com prazo", "No prazo", "Violadas", "Aderência"],
        linhas: [
          [
            "TODOS OS TIPOS",
            String(total),
            String(noPrazo),
            String(total - noPrazo),
            total ? `${Math.round((noPrazo / total) * 100)}%` : "",
          ],
          ...[...porTipo.entries()]
            .sort((a, b) => b[1].total - a[1].total)
            .map(([tipo, v]) => [
              rotuloDoTipo(tipos, tipo),
              String(v.total),
              String(v.noPrazo),
              String(v.total - v.noPrazo),
              `${Math.round((v.noPrazo / v.total) * 100)}%`,
            ]),
        ],
      };
    },
  },

  {
    id: "os-material",
    nome: "Material aplicado por OS",
    descricao: "O que cada atendimento consumiu e quanto custou.",
    periodo: true,
    async carregar(dias) {
      const ordens = await listarOrdensComMaterial(500);
      const desde = diasAtras(dias);
      const noPeriodo = ordens.filter((o) => o.abertaEm >= desde);

      return {
        colunas: [
          "OS",
          "Cliente",
          "Técnico",
          "Situação",
          "Movimentações",
          "Itens",
          "Custo",
          "Materiais",
          "Aberta em",
        ],
        linhas: noPeriodo.map((o) => [
          o.numero,
          texto(o.cliente),
          texto(o.tecnico),
          STATUS_OS.rotulo(o.status),
          String(o.movimentacoes),
          numero(o.totalItens, 2),
          numero(o.valor, 2),
          o.resumo,
          dataHora(o.abertaEm),
        ]),
      };
    },
  },

  {
    id: "deslocamento-tecnico",
    nome: "Deslocamento por técnico",
    descricao:
      "Distância percorrida e tempo em movimento, a partir das posições registradas (3.68).",
    periodo: true,
    async carregar(dias) {
      const desde = diasAtras(dias);
      const tecnicos = await prisma.tecnico.findMany({
        where: { ativo: true },
        include: { equipe: { select: { nome: true } } },
        orderBy: { nome: "asc" },
      });

      const linhas: string[][] = [];
      for (const tecnico of tecnicos) {
        const d = await deslocamentoDoTecnico(tecnico.id, desde);
        const concluidas = await prisma.ordemServico.count({
          where: {
            tecnicoId: tecnico.id,
            status: "CONCLUIDA",
            concluidaEm: { gte: desde },
          },
        });

        linhas.push([
          tecnico.nome,
          texto(tecnico.equipe?.nome),
          String(d.leituras),
          numero(d.km, 1),
          minutosLegiveis(d.minutosEmMovimento),
          String(concluidas),
          concluidas ? numero(d.km / concluidas, 1) : "",
          d.primeira ? dataHora(d.primeira) : "",
          d.ultima ? dataHora(d.ultima) : "",
        ]);
      }

      return {
        colunas: [
          "Técnico",
          "Equipe",
          "Leituras de posição",
          "Distância (km)",
          "Tempo em movimento",
          "OS concluídas",
          "km por OS",
          "Primeira leitura",
          "Última leitura",
        ],
        linhas,
      };
    },
  },

  {
    id: "os-incidentes",
    nome: "Possíveis incidentes",
    descricao:
      "Agrupamentos de OS próximas do mesmo tipo — hipótese, não conclusão (2.27).",
    async carregar() {
      const [incidentes, tipos] = await Promise.all([
        possiveisIncidentes(),
        todosTiposOS(),
      ]);
      return {
        colunas: [
          "Tipo",
          "Bairro",
          "OS agrupadas",
          "Raio (km)",
          "Janela",
          "Confiança",
          "Primeira",
          "Última",
          "Números",
        ],
        linhas: incidentes.map((i) => [
          rotuloDoTipo(tipos, i.tipo),
          texto(i.bairro),
          String(i.ordens.length),
          numero(i.raioKm, 2),
          minutosLegiveis(i.minutosDeJanela),
          i.confianca === "ALTA" ? "alta" : "média",
          dataHora(i.primeira),
          dataHora(i.ultima),
          i.ordens.map((o) => o.numero).join(", "),
        ]),
      };
    },
  },
];

/**
 * Estoque primeiro, operação depois — é a ordem em que a tela agrupa, e a
 * ordem em que a empresa cresceu usando o sistema.
 */
export const TODOS_RELATORIOS: Relatorio[] = [...RELATORIOS, ...RELATORIOS_OS];

export function relatorioPorId(id: string) {
  return TODOS_RELATORIOS.find((r) => r.id === id);
}

/** os grupos, para a tela separar as duas famílias */
export const GRUPOS_DE_RELATORIO = [
  { titulo: "Estoque", relatorios: RELATORIOS },
  { titulo: "Ordens de serviço e campo", relatorios: RELATORIOS_OS },
];

/** CSV com separador ponto e vírgula e BOM, para abrir direto no Excel pt-BR. */
export function montarCsv(colunas: string[], linhas: string[][]) {
  const escapar = (valor: string) =>
    /[";\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;

  const conteudo = [colunas, ...linhas]
    .map((linha) => linha.map((celula) => escapar(celula ?? "")).join(";"))
    .join("\r\n");

  return `﻿${conteudo}`;
}
