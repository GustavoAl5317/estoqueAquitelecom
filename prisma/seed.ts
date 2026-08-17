/**
 * Popula a base com uma operação plausível de ~90 dias, para que dashboard,
 * rankings, previsões e alertas tenham dados reais para mostrar.
 *
 * As operações passam pelos mesmos serviços usados pela aplicação — o seed
 * não escreve saldo na mão. Depois de cada operação, os registros criados são
 * retrodatados para montar o histórico.
 */
import { prisma } from "../src/lib/prisma";
import { CATEGORIAS_PADRAO } from "../src/lib/dominio";
import { slugificar } from "../src/lib/utils";
import { criarEntrada, receberEntrada } from "../src/lib/servicos/entradas";
import {
  registrarMovimentacao,
  registrarRetiradaDeCliente,
} from "../src/lib/servicos/movimentacoes";
import { concluirTriagem } from "../src/lib/servicos/triagem";
import { criarReserva } from "../src/lib/servicos/reservas";
import { iniciarInventario, registrarContagem } from "../src/lib/servicos/inventario";

// --------------------------------------------------------------------------
// utilidades determinísticas
// --------------------------------------------------------------------------

let semente = 20260815;
function aleatorio() {
  semente = (semente * 1103515245 + 12345) % 2147483648;
  return semente / 2147483648;
}
function inteiro(min: number, max: number) {
  return Math.floor(aleatorio() * (max - min + 1)) + min;
}
function escolher<T>(lista: T[]): T {
  return lista[Math.floor(aleatorio() * lista.length)];
}
function chance(probabilidade: number) {
  return aleatorio() < probabilidade;
}

const DIA = 86_400_000;
function diasAtras(dias: number, hora = 9) {
  const d = new Date(Date.now() - dias * DIA);
  d.setHours(hora, inteiro(0, 59), inteiro(0, 59), 0);
  return d;
}

/** roda uma operação e retrodata tudo o que ela criou */
async function em<T>(quando: Date, operacao: () => Promise<T>): Promise<T> {
  const marco = new Date();
  const resultado = await operacao();
  const onde = { criadoEm: { gte: marco } };
  const dados = { criadoEm: quando };
  await prisma.movimento.updateMany({ where: onde, data: dados });
  await prisma.movimentacao.updateMany({ where: onde, data: dados });
  await prisma.entrada.updateMany({ where: onde, data: dados });
  await prisma.auditoria.updateMany({ where: onde, data: dados });
  await prisma.triagem.updateMany({ where: onde, data: dados });
  await prisma.reserva.updateMany({ where: onde, data: dados });
  await prisma.unidadeSerial.updateMany({ where: onde, data: dados });
  await prisma.entrada.updateMany({
    where: { recebidoEm: { gte: marco } },
    data: { recebidoEm: quando },
  });
  return resultado;
}

function serialONU(i: number) {
  return `48575443${(0x100000 + i * 7919).toString(16).toUpperCase().padStart(6, "0")}`;
}
function mac(i: number) {
  const h = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");
  return `A4:${h((i * 13) % 256)}:${h((i * 29) % 256)}:${h((i * 47) % 256)}:${h((i * 83) % 256)}:${h(i % 256)}`;
}

// --------------------------------------------------------------------------

async function limpar() {
  const tabelas = [
    prisma.movimentacaoItemSerial,
    prisma.movimentacaoItem,
    prisma.movimento,
    prisma.triagem,
    prisma.reserva,
    prisma.inventarioItem,
    prisma.inventario,
    prisma.divergencia,
    prisma.movimentacao,
    prisma.entradaItem,
    prisma.entrada,
    prisma.unidadeSerial,
    prisma.saldo,
    prisma.auditoria,
    prisma.materialPrevistoOS,
    prisma.ordemServico,
    prisma.localizacaoTecnico,
    prisma.bairro,
    prisma.regiao,
    prisma.detentor,
    prisma.material,
    prisma.categoria,
    prisma.fornecedor,
    prisma.estoque,
    prisma.tecnico,
    prisma.equipe,
    prisma.usuario,
    prisma.configuracao,
  ];
  for (const tabela of tabelas) {
    await (tabela as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
}

async function main() {
  console.log("Limpando base…");
  await limpar();

  // ------------------------------------------------------------------ usuários
  console.log("Cadastros básicos…");
  const admin = await prisma.usuario.create({
    data: { nome: "Gustavo Alves", email: "admin@operacao.local", papel: "ADMIN" },
  });
  const supervisor = await prisma.usuario.create({
    data: { nome: "Marina Duarte", email: "marina@operacao.local", papel: "SUPERVISOR" },
  });
  const almoxarife = await prisma.usuario.create({
    data: { nome: "Renato Lima", email: "renato@operacao.local", papel: "ALMOXARIFE" },
  });

  // ------------------------------------------------------------------ equipes
  const equipesDados = [
    { nome: "Instalação 01", tipo: "INSTALACAO" },
    { nome: "Manutenção 01", tipo: "MANUTENCAO" },
    { nome: "Infraestrutura 01", tipo: "INFRAESTRUTURA" },
  ];
  const equipes: { equipe: { id: string; nome: string }; detentor: { id: string } }[] = [];
  for (const dados of equipesDados) {
    const equipe = await prisma.equipe.create({ data: dados });
    const detentor = await prisma.detentor.create({
      data: { tipo: "EQUIPE", nome: equipe.nome, equipeId: equipe.id },
    });
    equipes.push({ equipe, detentor });
  }

  // ------------------------------------------------------------------ técnicos
  const tecnicosDados = [
    { nome: "Lucas Ferreira", matricula: "T-001", equipe: 0 },
    { nome: "Carlos Menezes", matricula: "T-002", equipe: 0 },
    { nome: "João Batista", matricula: "T-003", equipe: 1 },
    { nome: "Marcos Vinícius", matricula: "T-004", equipe: 1 },
    { nome: "Rafael Torres", matricula: "T-005", equipe: 2 },
  ];
  const tecnicos = [];
  for (const dados of tecnicosDados) {
    const usuario = await prisma.usuario.create({
      data: {
        nome: dados.nome,
        email: `${slugificar(dados.nome)}@operacao.local`,
        papel: "TECNICO",
      },
    });
    const tecnico = await prisma.tecnico.create({
      data: {
        nome: dados.nome,
        matricula: dados.matricula,
        equipeId: equipes[dados.equipe].equipe.id,
        usuarioId: usuario.id,
        telefone: `(85) 9${inteiro(8000, 9999)}-${inteiro(1000, 9999)}`,
      },
    });
    const detentor = await prisma.detentor.create({
      data: { tipo: "TECNICO", nome: tecnico.nome, tecnicoId: tecnico.id },
    });
    tecnicos.push({ tecnico, detentor, usuario });
  }

  // ------------------------------------------------------------------ estoques
  const estoquesDados = [
    {
      nome: "Estoque Central",
      tipo: "CENTRAL",
      endereco: "Av. Bezerra de Menezes, 1200 — Fortaleza/CE",
      latitude: -3.7327,
      longitude: -38.5762,
      responsavelId: almoxarife.id,
    },
    {
      nome: "Almoxarifado Sul",
      tipo: "ALMOXARIFADO",
      endereco: "Av. Washington Soares, 4000 — Fortaleza/CE",
      latitude: -3.7899,
      longitude: -38.4818,
      responsavelId: supervisor.id,
    },
    {
      nome: "POP Messejana",
      tipo: "POP",
      endereco: "Rua Frei Vidal, 300 — Messejana",
      latitude: -3.8302,
      longitude: -38.4926,
      responsavelId: supervisor.id,
    },
    {
      nome: "Base Operacional Norte",
      tipo: "BASE",
      endereco: "Rua Padre Guerra, 55 — Parangaba",
      latitude: -3.7768,
      longitude: -38.5591,
      responsavelId: almoxarife.id,
    },
    {
      nome: "Veículo VAN-04",
      tipo: "VEICULO",
      endereco: "Frota operacional",
      responsavelId: almoxarife.id,
    },
  ];
  const estoques: { estoque: { id: string; nome: string }; detentor: { id: string } }[] = [];
  for (const dados of estoquesDados) {
    const estoque = await prisma.estoque.create({ data: dados });
    const detentor = await prisma.detentor.create({
      data: { tipo: "ESTOQUE", nome: estoque.nome, estoqueId: estoque.id },
    });
    estoques.push({ estoque, detentor });
  }
  const central = estoques[0].detentor;
  const almoxarifadoSul = estoques[1].detentor;

  // ------------------------------------------------------------------ categorias
  const categorias = new Map<string, string>();
  const cores = [
    "#2563eb", "#7c3aed", "#0891b2", "#0d9488", "#ca8a04",
    "#dc2626", "#db2777", "#65a30d", "#ea580c", "#4f46e5",
    "#0284c7", "#9333ea", "#16a34a", "#d97706", "#64748b",
  ];
  for (const [i, nome] of CATEGORIAS_PADRAO.entries()) {
    const categoria = await prisma.categoria.create({
      data: { nome, slug: slugificar(nome), cor: cores[i % cores.length], ordem: i },
    });
    categorias.set(nome, categoria.id);
  }

  // ------------------------------------------------------------------ fornecedores
  const fornecedores: { id: string; nome: string }[] = [];
  for (const dados of [
    { nome: "Fibratec Distribuidora", documento: "12.345.678/0001-90", contato: "(85) 3222-1100" },
    { nome: "OptiCabos Nordeste", documento: "98.765.432/0001-10", contato: "(85) 3333-4400" },
    { nome: "TecnoRede Importação", documento: "45.678.912/0001-33", contato: "(11) 4004-2020" },
  ]) {
    fornecedores.push(await prisma.fornecedor.create({ data: dados }));
  }

  // ------------------------------------------------------------------ materiais
  console.log("Materiais…");
  const materiaisDados = [
    ["ONU-HW-8145", "ONU Huawei EG8145V5", "ONU", "Huawei", "EG8145V5", "UN", "SERIAL", 20, 90, 210],
    ["ONU-ZTE-670L", "ONU ZTE F670L", "ONU", "ZTE", "F670L", "UN", "SERIAL", 15, 60, 195],
    ["RTR-TPL-C6", "Roteador TP-Link Archer C6", "Roteador", "TP-Link", "Archer C6", "UN", "SERIAL", 10, 45, 180],
    ["SWT-TPL-8P", "Switch TP-Link 8 portas", "Equipamentos", "TP-Link", "TL-SG108", "UN", "SERIAL", 3, 10, 320],
    ["RAD-UBQ-LB5", "Rádio Ubiquiti LiteBeam 5AC", "Equipamentos", "Ubiquiti", "LBE-5AC", "UN", "SERIAL", 3, 12, 480],
    ["CAB-DROP-1FO", "Cabo Drop 1FO", "Cabo drop", "Furukawa", "Drop 1FO", "M", "QUANTIDADE", 2000, 9000, 0.62],
    ["CAB-OPT-12FO", "Cabo óptico 12FO", "Cabo drop", "Furukawa", "AS 12FO", "M", "QUANTIDADE", 800, 4000, 3.2],
    ["CAB-CAT5E", "Cabo de rede CAT5e", "Cabo de rede", "Nexans", "CAT5e U/UTP", "M", "QUANTIDADE", 500, 2500, 1.15],
    ["CON-APC", "Conector APC", "Conector", "Fiberhome", "SC/APC", "UN", "QUANTIDADE", 250, 1200, 2.4],
    ["CON-UPC", "Conector UPC", "Conector", "Fiberhome", "SC/UPC", "UN", "QUANTIDADE", 200, 900, 2.2],
    ["CON-RJ45", "Conector RJ45", "Conector", "Furukawa", "CAT5e", "UN", "QUANTIDADE", 300, 1500, 0.45],
    ["ADP-SC-APC", "Adaptador óptico SC/APC", "Adaptador", "Fiberhome", "SC/APC", "UN", "QUANTIDADE", 120, 500, 3.1],
    ["SPL-1X8", "Splitter 1x8", "Splitter", "Fiberhome", "PLC 1x8", "UN", "QUANTIDADE", 20, 90, 28],
    ["SPL-1X16", "Splitter 1x16", "Splitter", "Fiberhome", "PLC 1x16", "UN", "QUANTIDADE", 12, 45, 46],
    ["FNT-12V1A", "Fonte 12V 1A", "Fonte", "Genérica", "12V/1A", "UN", "QUANTIDADE", 25, 100, 22],
    ["COR-SC-APC-2M", "Cordão óptico SC/APC 2m", "Cordão óptico", "Furukawa", "SM 2m", "UN", "QUANTIDADE", 60, 240, 9.5],
    ["CX-EMENDA-24", "Caixa de emenda 24FO", "Caixa", "Fiberhome", "CE 24FO", "UN", "QUANTIDADE", 6, 24, 145],
    ["CTO-16P", "CTO 16 portas", "Caixa", "Fiberhome", "CTO-16", "UN", "QUANTIDADE", 6, 24, 210],
    ["FER-ABRC-200", "Abraçadeira plástica 200mm", "Ferragens", "Hellermann", "T50R", "UN", "QUANTIDADE", 600, 2500, 0.12],
    ["FER-PARBUC-8", "Parafuso com bucha 8mm", "Ferragens", "Tramontina", "8mm", "UN", "QUANTIDADE", 400, 1800, 0.28],
    ["FER-ESTIC", "Esticador dielétrico", "Ferragens", "Fiberhome", "Drop", "UN", "QUANTIDADE", 150, 600, 1.8],
    ["FRM-ALICATE", "Alicate de crimpagem RJ45", "Ferramentas", "Hikari", "HK-315", "UN", "QUANTIDADE", 2, 8, 89],
    ["CNS-FITA-20", "Fita isolante 20m", "Materiais de consumo", "3M", "Scotch 33", "UN", "QUANTIDADE", 30, 130, 4.5],
    ["CNS-ALCOOL", "Álcool isopropílico 100ml", "Materiais de consumo", "Implastec", "100ml", "UN", "QUANTIDADE", 12, 50, 12],
  ] as const;

  const materiais = new Map<string, { id: string; controle: string; unidade: string }>();
  for (const [codigo, nome, categoria, fabricante, modelo, unidade, controle, minimo, ideal, valor] of materiaisDados) {
    const material = await prisma.material.create({
      data: {
        codigoInterno: codigo,
        nome,
        categoriaId: categorias.get(categoria)!,
        fabricante,
        modelo,
        unidadeMedida: unidade,
        controle,
        quantidadeMinima: minimo,
        quantidadeIdeal: ideal,
        valorMedio: valor,
        codigoBarras: `789${inteiro(100000000, 999999999)}`,
      },
    });
    materiais.set(codigo, { id: material.id, controle, unidade });
  }

  const m = (codigo: string) => materiais.get(codigo)!;

  // ------------------------------------------------------------------ compras
  console.log("Histórico de entradas…");
  let contadorSerial = 1;

  const gerarSeriais = (codigo: string, qtd: number) =>
    Array.from({ length: qtd }, () => {
      const i = contadorSerial++;
      return {
        serial:
          codigo.startsWith("ONU") ? serialONU(i) : `${codigo}-${String(i).padStart(6, "0")}`,
        macAddress: mac(i),
        patrimonio: `PAT-${String(100000 + i)}`,
        estadoFisico: "NOVO",
      };
    });

  async function comprar(
    dia: number,
    destino: string,
    itens: { codigo: string; quantidade: number; valor: number }[],
    fornecedorIndice = 0,
  ) {
    const quando = diasAtras(dia, inteiro(8, 11));
    return em(quando, async () => {
      const id = await criarEntrada(
        {
          tipo: "COMPRA",
          destinoId: destino,
          fornecedorId: fornecedores[fornecedorIndice].id,
          documento: `NF ${inteiro(10000, 99999)}`,
          itens: itens.map((item) => ({
            materialId: m(item.codigo).id,
            quantidadePrevista: item.quantidade,
            valorUnitario: item.valor,
            seriais:
              m(item.codigo).controle === "SERIAL"
                ? gerarSeriais(item.codigo, item.quantidade)
                : undefined,
          })),
        },
        almoxarife.id,
      );
      await receberEntrada({ entradaId: id, itens: [] }, almoxarife.id);
      return id;
    });
  }

  // carga inicial
  await comprar(88, central.id, [
    { codigo: "ONU-HW-8145", quantidade: 120, valor: 208 },
    { codigo: "ONU-ZTE-670L", quantidade: 60, valor: 192 },
    { codigo: "RTR-TPL-C6", quantidade: 50, valor: 178 },
    { codigo: "CAB-DROP-1FO", quantidade: 12000, valor: 0.6 },
    { codigo: "CON-APC", quantidade: 2000, valor: 2.35 },
    { codigo: "CON-UPC", quantidade: 1200, valor: 2.15 },
    { codigo: "CON-RJ45", quantidade: 2000, valor: 0.44 },
    { codigo: "SPL-1X8", quantidade: 120, valor: 27.5 },
    { codigo: "SPL-1X16", quantidade: 60, valor: 45 },
    { codigo: "FNT-12V1A", quantidade: 150, valor: 21.5 },
    { codigo: "COR-SC-APC-2M", quantidade: 300, valor: 9.2 },
    { codigo: "FER-ABRC-200", quantidade: 4000, valor: 0.11 },
    { codigo: "FER-PARBUC-8", quantidade: 2500, valor: 0.27 },
    { codigo: "FER-ESTIC", quantidade: 800, valor: 1.75 },
    { codigo: "CNS-FITA-20", quantidade: 180, valor: 4.4 },
    { codigo: "CNS-ALCOOL", quantidade: 60, valor: 11.8 },
  ]);

  await comprar(
    86,
    almoxarifadoSul.id,
    [
      { codigo: "CAB-OPT-12FO", quantidade: 5000, valor: 3.1 },
      { codigo: "CAB-CAT5E", quantidade: 3000, valor: 1.1 },
      { codigo: "CX-EMENDA-24", quantidade: 30, valor: 142 },
      { codigo: "CTO-16P", quantidade: 30, valor: 205 },
      { codigo: "ADP-SC-APC", quantidade: 600, valor: 3 },
      { codigo: "FRM-ALICATE", quantidade: 8, valor: 87 },
      { codigo: "SWT-TPL-8P", quantidade: 12, valor: 315 },
      { codigo: "RAD-UBQ-LB5", quantidade: 14, valor: 475 },
    ],
    1,
  );

  // reposições ao longo do período
  await comprar(62, central.id, [
    { codigo: "ONU-HW-8145", quantidade: 60, valor: 212 },
    { codigo: "CON-APC", quantidade: 1500, valor: 2.45 },
    { codigo: "CAB-DROP-1FO", quantidade: 8000, valor: 0.63 },
  ]);
  await comprar(
    38,
    central.id,
    [
      { codigo: "ONU-HW-8145", quantidade: 50, valor: 215 },
      { codigo: "RTR-TPL-C6", quantidade: 30, valor: 182 },
      { codigo: "FNT-12V1A", quantidade: 80, valor: 22.5 },
      { codigo: "CON-RJ45", quantidade: 1500, valor: 0.46 },
    ],
    2,
  );
  await comprar(16, central.id, [
    { codigo: "CAB-DROP-1FO", quantidade: 6000, valor: 0.64 },
    { codigo: "CON-APC", quantidade: 1000, valor: 2.5 },
    { codigo: "SPL-1X8", quantidade: 40, valor: 29 },
  ]);

  // entrada com divergência (1.6)
  await em(diasAtras(24, 10), async () => {
    const id = await criarEntrada(
      {
        tipo: "COMPRA",
        destinoId: central.id,
        fornecedorId: fornecedores[0].id,
        documento: "NF 27431",
        observacao: "Carga recebida com volume avariado no transporte.",
        itens: [
          { materialId: m("COR-SC-APC-2M").id, quantidadePrevista: 200, valorUnitario: 9.4 },
          { materialId: m("CNS-FITA-20").id, quantidadePrevista: 100, valorUnitario: 4.6 },
        ],
      },
      almoxarife.id,
    );
    const entrada = await prisma.entrada.findUnique({
      where: { id },
      include: { itens: true },
    });
    await receberEntrada(
      {
        entradaId: id,
        itens: [
          {
            itemId: entrada!.itens[0].id,
            quantidadeRecebida: 196,
            motivo: "4 cordões chegaram com o conector danificado.",
          },
          { itemId: entrada!.itens[1].id, quantidadeRecebida: 100 },
        ],
      },
      almoxarife.id,
    );
  });

  // ------------------------------------------------------------------ operação diária
  console.log("Movimentações do período…");

  const consumiveis = [
    { codigo: "CON-APC", min: 8, max: 40 },
    { codigo: "CON-RJ45", min: 6, max: 30 },
    { codigo: "FER-ABRC-200", min: 20, max: 80 },
    { codigo: "FER-PARBUC-8", min: 10, max: 50 },
    { codigo: "FER-ESTIC", min: 4, max: 18 },
    { codigo: "CNS-FITA-20", min: 1, max: 4 },
    { codigo: "COR-SC-APC-2M", min: 2, max: 8 },
    { codigo: "FNT-12V1A", min: 1, max: 5 },
  ];

  for (let dia = 84; dia >= 0; dia--) {
    const diaDaSemana = new Date(Date.now() - dia * DIA).getDay();
    if (diaDaSemana === 0) continue; // domingo

    // retirada de material pelos técnicos
    const quantosTecnicos = diaDaSemana === 6 ? 2 : inteiro(2, 4);
    const escolhidos = [...tecnicos].sort(() => aleatorio() - 0.5).slice(0, quantosTecnicos);

    for (const tec of escolhidos) {
      const itens: {
        materialId: string;
        quantidade?: number;
        seriaisIds?: string[];
      }[] = [];

      // ONUs e roteadores (serializados)
      if (chance(0.75)) {
        const codigo = chance(0.7) ? "ONU-HW-8145" : "ONU-ZTE-670L";
        const disponiveis = await prisma.unidadeSerial.findMany({
          where: {
            materialId: m(codigo).id,
            detentorId: central.id,
            status: "DISPONIVEL",
          },
          take: inteiro(1, 3),
        });
        if (disponiveis.length) {
          itens.push({
            materialId: m(codigo).id,
            seriaisIds: disponiveis.map((u) => u.id),
          });
        }
      }
      if (chance(0.35)) {
        const disponiveis = await prisma.unidadeSerial.findMany({
          where: {
            materialId: m("RTR-TPL-C6").id,
            detentorId: central.id,
            status: "DISPONIVEL",
          },
          take: inteiro(1, 2),
        });
        if (disponiveis.length) {
          itens.push({
            materialId: m("RTR-TPL-C6").id,
            seriaisIds: disponiveis.map((u) => u.id),
          });
        }
      }

      // cabo drop
      if (chance(0.8)) {
        itens.push({ materialId: m("CAB-DROP-1FO").id, quantidade: inteiro(6, 25) * 20 });
      }
      // consumíveis
      for (const item of consumiveis) {
        if (!chance(0.45)) continue;
        itens.push({
          materialId: m(item.codigo).id,
          quantidade: inteiro(item.min, item.max),
        });
      }

      if (!itens.length) continue;

      await em(diasAtras(dia, inteiro(7, 9)), () =>
        registrarMovimentacao(
          {
            tipo: "SAIDA",
            finalidade: "TECNICO",
            origemId: central.id,
            destinoId: tec.detentor.id,
            solicitanteId: tec.usuario.id,
            motivo: "Retirada para atendimentos do dia",
            itens,
          },
          almoxarife.id,
        ),
      ).catch(() => undefined); // ignora dias em que o saldo acabou
    }

    // instalações: consomem o que está com o técnico
    for (const tec of escolhidos) {
      if (!chance(0.8)) continue;

      const onusEmPosse = await prisma.unidadeSerial.findMany({
        where: { detentorId: tec.detentor.id, status: "EM_POSSE_TECNICO" },
        take: inteiro(1, 2),
      });
      for (const onu of onusEmPosse) {
        await em(diasAtras(dia, inteiro(10, 17)), () =>
          registrarMovimentacao(
            {
              tipo: "SAIDA",
              finalidade: "INSTALACAO",
              origemId: tec.detentor.id,
              clienteRef: `CLI-${inteiro(1000, 9999)}`,
              motivo: "Instalação concluída",
              itens: [{ materialId: onu.materialId, seriaisIds: [onu.id] }],
            },
            tec.usuario.id,
          ),
        ).catch(() => undefined);
      }

      const saldosTecnico = await prisma.saldo.findMany({
        where: { detentorId: tec.detentor.id, quantidade: { gt: 0 } },
        include: { material: true },
      });
      const aplicados = saldosTecnico
        .filter((s) => s.material.controle === "QUANTIDADE")
        .filter(() => chance(0.6));

      if (aplicados.length) {
        await em(diasAtras(dia, inteiro(11, 18)), () =>
          registrarMovimentacao(
            {
              tipo: "SAIDA",
              finalidade: "INSTALACAO",
              origemId: tec.detentor.id,
              motivo: "Material aplicado em atendimento",
              itens: aplicados.map((s) => ({
                materialId: s.materialId,
                quantidade: Math.max(
                  1,
                  Math.min(s.quantidade, Math.round(s.quantidade * (0.3 + aleatorio() * 0.5))),
                ),
              })),
            },
            tec.usuario.id,
          ),
        ).catch(() => undefined);
      }
    }

    // retirada de equipamento no cliente (logística reversa)
    if (chance(0.3)) {
      const tec = escolher(tecnicos);
      await em(diasAtras(dia, inteiro(12, 16)), () =>
        registrarRetiradaDeCliente(
          {
            detentorId: tec.detentor.id,
            materialId: m("ONU-HW-8145").id,
            serial: `RET-${String(contadorSerial++).padStart(6, "0")}`,
            estadoFisico: escolher(["BOM", "USADO", "DEFEITUOSO", "DANIFICADO"]),
            clienteRef: `CLI-${inteiro(1000, 9999)}`,
          },
          tec.usuario.id,
        ),
      ).catch(() => undefined);
    }

    // devoluções ao estoque
    if (chance(0.35)) {
      const tec = escolher(tecnicos);
      const unidades = await prisma.unidadeSerial.findMany({
        where: {
          detentorId: tec.detentor.id,
          status: { in: ["AGUARDANDO_DEVOLUCAO", "EM_POSSE_TECNICO"] },
        },
        take: 2,
      });
      if (unidades.length) {
        const porMaterial = new Map<string, string[]>();
        for (const u of unidades) {
          porMaterial.set(u.materialId, [...(porMaterial.get(u.materialId) ?? []), u.id]);
        }
        await em(diasAtras(dia, inteiro(16, 18)), () =>
          registrarMovimentacao(
            {
              tipo: "DEVOLUCAO",
              finalidade: "TECNICO",
              origemId: tec.detentor.id,
              destinoId: central.id,
              motivo: "Devolução de fim de jornada",
              itens: [...porMaterial.entries()].map(([materialId, ids]) => ({
                materialId,
                seriaisIds: ids,
                estadoFisico: escolher(["BOM", "USADO", "DEFEITUOSO"]),
              })),
            },
            almoxarife.id,
          ),
        ).catch(() => undefined);
      }
    }

    // transferência entre estoques
    if (chance(0.12)) {
      await em(diasAtras(dia, 14), () =>
        registrarMovimentacao(
          {
            tipo: "TRANSFERENCIA",
            finalidade: "TRANSFERENCIA",
            origemId: central.id,
            destinoId: escolher([estoques[2].detentor.id, estoques[3].detentor.id]),
            motivo: "Abastecimento de base regional",
            itens: [
              { materialId: m("CON-APC").id, quantidade: inteiro(50, 200) },
              { materialId: m("CAB-DROP-1FO").id, quantidade: inteiro(200, 800) },
            ],
          },
          almoxarife.id,
        ),
      ).catch(() => undefined);
    }

    // material para equipe de infraestrutura
    if (chance(0.18)) {
      await em(diasAtras(dia, 8), () =>
        registrarMovimentacao(
          {
            tipo: "SAIDA",
            finalidade: "EQUIPE",
            origemId: almoxarifadoSul.id,
            destinoId: escolher(equipes).detentor.id,
            motivo: "Projeto de expansão de rede",
            itens: [
              { materialId: m("CAB-OPT-12FO").id, quantidade: inteiro(200, 600) },
              { materialId: m("CX-EMENDA-24").id, quantidade: inteiro(1, 3) },
              { materialId: m("ADP-SC-APC").id, quantidade: inteiro(10, 40) },
            ],
          },
          supervisor.id,
        ),
      ).catch(() => undefined);
    }
  }

  // ------------------------------------------------------------------ triagem
  console.log("Triagem e logística reversa…");
  const triagensPendentes = await prisma.triagem.findMany({
    where: { status: "AGUARDANDO" },
    orderBy: { criadoEm: "asc" },
  });

  // resolve a maior parte do passivo, mantendo uma fila viva para a tela
  for (const triagem of triagensPendentes.slice(0, Math.max(0, triagensPendentes.length - 6))) {
    const estado = triagem.estadoRecebido ?? "BOM";
    const resultado =
      estado === "DEFEITUOSO" || estado === "DANIFICADO"
        ? chance(0.6)
          ? "MANUTENCAO"
          : "DESCARTE"
        : "APROVADO";
    await em(new Date(triagem.criadoEm.getTime() + DIA), () =>
      concluirTriagem(
        {
          triagemId: triagem.id,
          resultado,
          destinoId: resultado === "APROVADO" ? central.id : undefined,
          laudo:
            resultado === "APROVADO"
              ? "Equipamento testado e aprovado para reuso."
              : resultado === "MANUTENCAO"
                ? "Encaminhado para bancada — falha na porta PON."
                : "Sem condições de recuperação.",
          estadoFisico: resultado === "APROVADO" ? "BOM" : estado,
        },
        supervisor.id,
      ),
    ).catch(() => undefined);
  }

  // ------------------------------------------------------------------ estado atual
  console.log("Situação atual (reservas, entradas pendentes, inventário)…");

  // 1.5 — entrada aguardando conferência
  await criarEntrada(
    {
      tipo: "COMPRA",
      destinoId: central.id,
      fornecedorId: fornecedores[2].id,
      documento: "NF 30918",
      observacao: "Chegada prevista para conferência do turno da tarde.",
      itens: [
        {
          materialId: m("ONU-HW-8145").id,
          quantidadePrevista: 40,
          valorUnitario: 216,
          seriais: gerarSeriais("ONU-HW-8145", 40),
        },
        { materialId: m("CON-APC").id, quantidadePrevista: 800, valorUnitario: 2.52 },
        { materialId: m("SPL-1X16").id, quantidadePrevista: 25, valorUnitario: 47 },
      ],
    },
    almoxarife.id,
  );

  // 1.14 — reservas ativas
  const onuDisponivel = await prisma.unidadeSerial.findFirst({
    where: { materialId: m("ONU-HW-8145").id, detentorId: central.id, status: "DISPONIVEL" },
  });
  if (onuDisponivel) {
    await criarReserva(
      {
        materialId: m("ONU-HW-8145").id,
        detentorId: central.id,
        quantidade: 1,
        unidadeId: onuDisponivel.id,
        finalidade: "ORDEM_SERVICO",
        tecnicoId: tecnicos[0].tecnico.id,
        expiraEm: new Date(Date.now() + 2 * DIA),
        observacao: "Separada para instalação agendada.",
      },
      supervisor.id,
    );
  }
  await criarReserva(
    {
      materialId: m("CAB-DROP-1FO").id,
      detentorId: central.id,
      quantidade: 800,
      finalidade: "PROJETO",
      equipeId: equipes[2].equipe.id,
      expiraEm: new Date(Date.now() + 5 * DIA),
      observacao: "Projeto de expansão — Bairro Messejana.",
    },
    supervisor.id,
  ).catch(() => undefined);
  await criarReserva(
    {
      materialId: m("SPL-1X8").id,
      detentorId: central.id,
      quantidade: 8,
      finalidade: "MANUTENCAO",
      equipeId: equipes[1].equipe.id,
      observacao: "Reposição de CTOs com falha.",
    },
    supervisor.id,
  ).catch(() => undefined);

  // 1.26 — inventário em contagem no Almoxarifado Sul
  const inventario = await iniciarInventario(
    { detentorId: almoxarifadoSul.id, observacao: "Contagem mensal do almoxarifado." },
    almoxarife.id,
  );
  const itensInventario = await prisma.inventarioItem.findMany({
    where: { inventarioId: inventario.id },
    take: 4,
  });
  await registrarContagem(
    itensInventario.map((item, i) => ({
      itemId: item.id,
      quantidadeContada:
        i % 3 === 0
          ? Math.max(0, item.quantidadeSistema - inteiro(1, 4))
          : item.quantidadeSistema,
      observacao: i % 3 === 0 ? "Divergência confirmada em recontagem." : null,
    })),
  );

  // 1.16 — limiares configuráveis
  for (const [chave, valor] of Object.entries({
    normal: 50,
    atencao: 20,
    critico: 1,
    diasMaterialParado: 15,
    desvioConsumo: 30,
    diasAguardandoDevolucao: 7,
  })) {
    await prisma.configuracao.create({
      data: {
        chave: `estoque.${chave}`,
        valor: String(valor),
        descricao: "Regra de classificação e alerta do estoque",
      },
    });
  }

  // ------------------------------------------------------------------ frota
  console.log("Frota e posições do rastreador…");

  const veiculosDados = [
    { placa: "PHK4A21", apelido: "VAN-04", modelo: "Fiat Fiorino", rastreador: "100001", estoque: 4 },
    { placa: "QTR7B85", apelido: "Moto 01", modelo: "Honda CG 160", rastreador: "100002" },
    { placa: "RKD2C09", apelido: "VAN-02", modelo: "Renault Kangoo", rastreador: "100003" },
    { placa: "SLM5D33", apelido: "Utilitário 03", modelo: "Saveiro", rastreador: "100004" },
  ];

  // pontos plausíveis dentro de Fortaleza
  const rotas = [
    { lat: -3.8302, lng: -38.4926, ref: "Messejana" },
    { lat: -3.7768, lng: -38.5591, ref: "Parangaba" },
    { lat: -3.7327, lng: -38.5762, ref: "Bezerra de Menezes" },
    { lat: -3.7899, lng: -38.4818, ref: "Washington Soares" },
  ];

  for (const [i, dados] of veiculosDados.entries()) {
    const veiculo = await prisma.veiculo.create({
      data: {
        placa: dados.placa,
        apelido: dados.apelido,
        modelo: dados.modelo,
        rastreador: dados.rastreador,
        estoqueId:
          dados.estoque !== undefined ? estoques[dados.estoque].estoque.id : null,
        tecnicoAtualId: tecnicos[i].tecnico.id,
      },
    });

    await prisma.vinculoVeiculo.create({
      data: {
        veiculoId: veiculo.id,
        tecnicoId: tecnicos[i].tecnico.id,
        criadoPorId: supervisor.id,
        inicio: diasAtras(inteiro(2, 20), 7),
        observacao: "Vínculo de jornada",
      },
    });

    // trilha das últimas horas, terminando na posição atual
    const base = rotas[i % rotas.length];
    for (let passo = 6; passo >= 0; passo--) {
      await prisma.posicaoVeiculo.create({
        data: {
          veiculoId: veiculo.id,
          latitude: base.lat + (aleatorio() - 0.5) * 0.02 * passo,
          longitude: base.lng + (aleatorio() - 0.5) * 0.02 * passo,
          velocidade: passo === 0 ? 0 : inteiro(15, 60),
          ignicao: passo !== 0,
          endereco: base.ref,
          origem: "RASTREADOR",
          capturadoEm: new Date(Date.now() - passo * 22 * 60_000),
        },
      });
    }
  }

  // 3.55 — pesos do score operacional
  for (const [chave, valor] of Object.entries({
    pesoDistancia: 30,
    pesoCarga: 20,
    pesoMaterial: 15,
    pesoRegiao: 10,
    pesoDisponibilidade: 25,
    minutosPosicaoAtual: 5,
    raioAtuacaoKm: 8,
    minutosParadaSuspeita: 40,
  })) {
    await prisma.configuracao.create({
      data: {
        chave: `operacao.${chave}`,
        valor: String(valor),
        descricao: "Parâmetro de análise operacional",
      },
    });
  }

  // ------------------------------------------------------------------ Blocos 2 e 3
  const regiao = await prisma.regiao.create({ data: { nome: "Região Sul 01" } });
  const bairros = ["Messejana", "Cambeba", "Lagoa Redonda", "Aldeota", "Parangaba"];
  for (const [i, nome] of bairros.entries()) {
    await prisma.bairro.create({
      data: {
        nome,
        cidade: "Fortaleza",
        regiaoId: i < 3 ? regiao.id : null,
        responsavelPrincipalId: tecnicos[i % tecnicos.length].tecnico.id,
        responsavelSecundarioId: tecnicos[(i + 1) % tecnicos.length].tecnico.id,
        equipeId: equipes[i % equipes.length].equipe.id,
      },
    });
  }

  const resumo = await prisma.$transaction([
    prisma.material.count(),
    prisma.unidadeSerial.count(),
    prisma.movimento.count(),
    prisma.movimentacao.count(),
    prisma.entrada.count(),
    prisma.triagem.count(),
  ]);

  console.log(`
Base populada:
  ${resumo[0]} materiais
  ${resumo[1]} unidades serializadas
  ${resumo[2]} movimentos no histórico
  ${resumo[3]} movimentações
  ${resumo[4]} entradas
  ${resumo[5]} registros de triagem
  ${tecnicos.length} técnicos, ${equipes.length} equipes, ${estoques.length} estoques
`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
