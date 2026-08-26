import { prisma } from "@/lib/prisma";
import { PAPEL_USUARIO, TIPO_ESTOQUE } from "@/lib/dominio";
import { limiares } from "@/lib/servicos/consultas";
import { numero } from "@/lib/utils";
import { CabecalhoPagina, Cartao, Etiqueta, Secao } from "@/components/ui";
import {
  FormularioNovoTipoOS,
  ListaDeTiposOS,
  type TipoEditavel,
} from "@/components/formularios-tipo-os";
import { todosTiposOS } from "@/lib/servicos/tipos-os";
import { parametros } from "@/lib/servicos/parametros";
import { DistribuicaoDeTecnicos } from "@/components/distribuicao-tecnicos";
import {
  FormularioCategoria,
  FormularioEquipe,
  FormularioEstoque,
  FormularioFornecedor,
  FormularioLimiares,
  FormularioTecnico,
} from "@/components/formularios-cadastro";

export const dynamic = "force-dynamic";

export default async function Configuracoes() {
  const [
    regras,
    categorias,
    estoques,
    tecnicos,
    equipes,
    fornecedores,
    usuarios,
    tiposOS,
  ] = await Promise.all([
      limiares(),
      prisma.categoria.findMany({
        include: { _count: { select: { materiais: true } } },
        orderBy: { ordem: "asc" },
      }),
      prisma.estoque.findMany({
        include: { responsavel: true },
        orderBy: { nome: "asc" },
      }),
      prisma.tecnico.findMany({
        include: {
          equipe: true,
          tiposAtendidos: { select: { id: true } },
          // o nome que o SGP já usou para esta pessoa, para sugerir o login
          ordens: {
            where: { tecnicoSgpNome: { not: null } },
            select: { tecnicoSgpNome: true },
            orderBy: { abertaEm: "desc" },
            take: 1,
          },
        },
        orderBy: { nome: "asc" },
      }),
      prisma.equipe.findMany({
        include: { _count: { select: { tecnicos: true } } },
        orderBy: { nome: "asc" },
      }),
      prisma.fornecedor.findMany({ orderBy: { nome: "asc" } }),
      prisma.usuario.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
      todosTiposOS(),
    ]);

  const config = await parametros();

  return (
    <>
      <CabecalhoPagina
        titulo="Configurações"
        descricao="Regras de criticidade, categorias e cadastros da operação."
      />

      <div className="space-y-4">
        {/* 1.16 */}
        <Cartao
          titulo="Regras de estoque crítico"
          descricao="Percentuais calculados sobre a quantidade ideal de cada material."
        >
          <FormularioLimiares atuais={regras} />
        </Cartao>

        {/* 1.2 */}
        <Cartao
          titulo="Categorias"
          descricao={`${categorias.length} categoria(s). A estrutura aceita novas sem alteração no sistema.`}
        >
          <div className="mb-4 flex flex-wrap gap-1.5">
            {categorias.map((categoria) => (
              <span
                key={categoria.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--borda)] px-2.5 py-1 text-xs"
              >
                <span
                  className="size-2 rounded-full"
                  style={{ background: categoria.cor }}
                />
                {categoria.nome}
                <span className="text-[var(--texto-3)]">
                  {categoria._count.materiais}
                </span>
              </span>
            ))}
          </div>
          <FormularioCategoria />
        </Cartao>

        {/* 2.5 */}
        <Cartao
          titulo="Tipos de ordem de serviço"
          descricao="O vocabulário do Bloco 2. O código de cada tipo não muda — ele já está gravado nas OS existentes; o que se edita é o nome, a cor e se o tipo continua em uso."
        >
          <div className="mb-4">
            <ListaDeTiposOS tipos={tiposOS as TipoEditavel[]} />
          </div>
          <FormularioNovoTipoOS />
        </Cartao>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* 1.1 */}
          <Cartao
            titulo="Locais de estoque"
            descricao={`${estoques.length} local(is) cadastrado(s)`}
          >
            <ul className="mb-4 space-y-1.5">
              {estoques.map((estoque) => (
                <li
                  key={estoque.id}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <span className="font-medium">{estoque.nome}</span>
                  <Etiqueta tom={TIPO_ESTOQUE.tom(estoque.tipo)}>
                    {TIPO_ESTOQUE.rotulo(estoque.tipo)}
                  </Etiqueta>
                  {estoque.responsavel && (
                    <span className="text-xs text-[var(--texto-3)]">
                      {estoque.responsavel.nome}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <FormularioEstoque
              usuarios={usuarios.map((u) => ({
                id: u.id,
                nome: u.nome,
                papel: u.papel,
              }))}
            />
          </Cartao>

          {/* 1.8 / 1.9 */}
          {/*
            Dois cadastros distintos moravam no mesmo bloco, um debaixo do
            outro e sem rótulo — lia-se como um formulário só, embaralhado. A
            equipe vem primeiro porque o técnico depende dela.
          */}
          <Cartao
            titulo="Técnicos e equipes"
            descricao={`${tecnicos.length} técnico(s) · ${equipes.length} equipe(s)`}
          >
            <div className="space-y-5">
              <Secao titulo="1. Equipes">
                {equipes.length === 0 ? (
                  <p className="text-sm text-[var(--texto-3)]">
                    Nenhuma equipe cadastrada. É opcional — um técnico pode
                    existir sem equipe —, mas agrupar ajuda no quadro por
                    equipe e no rebalanceamento.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {equipes.map((equipe) => (
                      <li key={equipe.id} className="text-sm">
                        <span className="font-medium">{equipe.nome}</span>
                        <span className="ml-2 text-xs text-[var(--texto-3)]">
                          {equipe._count.tecnicos} técnico(s)
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <FormularioEquipe />
              </Secao>

              <div className="border-t border-[var(--borda)] pt-5">
                <Secao titulo="2. Técnicos">
                  {tecnicos.length === 0 ? (
                    <p className="text-sm text-[var(--texto-3)]">
                      Nenhum técnico cadastrado. Sem isso não há a quem
                      atribuir uma OS — é o cadastro que destrava o quadro.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {tecnicos.map((tecnico) => (
                        <li key={tecnico.id} className="text-sm">
                          <span className="font-medium">{tecnico.nome}</span>
                          <span className="ml-2 text-xs text-[var(--texto-3)]">
                            {tecnico.matricula}
                            {tecnico.equipe ? ` · ${tecnico.equipe.nome}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <FormularioTecnico
                    equipes={equipes.map((e) => ({ id: e.id, nome: e.nome }))}
                  />
                </Secao>
              </div>
            </div>
          </Cartao>
        </div>

        <Cartao
          titulo="Distribuição automática de OS"
          descricao="Quem entra no rodízio e quem atende cada tipo. A ordem que chega do SGP sem responsável é distribuída por distância, carga, material em posse e região."
        >
          <DistribuicaoDeTecnicos
            ligada={config.distribuicaoAutomatica === 1}
            escreveNoSgp={config.notificarSgp === 1}
            tipos={tiposOS
              .filter((t) => t.ativo)
              .map((t) => ({ id: t.id, rotulo: t.rotulo }))}
            tecnicos={tecnicos.map((t) => ({
              id: t.id,
              nome: t.nome,
              recebeAutomatico: t.recebeAutomatico,
              tiposAtendidos: t.tiposAtendidos.map((x) => x.id),
              loginSgp: t.loginSgp,
              nomeNoSgp: t.ordens[0]?.tecnicoSgpNome ?? null,
            }))}
          />
        </Cartao>

        <Cartao
          titulo="Fornecedores"
          descricao={`${fornecedores.length} cadastrado(s)`}
        >
          <div className="mb-4 flex flex-wrap gap-1.5">
            {fornecedores.map((fornecedor) => (
              <span
                key={fornecedor.id}
                className="rounded-full border border-[var(--borda)] px-2.5 py-1 text-xs"
              >
                {fornecedor.nome}
              </span>
            ))}
          </div>
          <FormularioFornecedor />
        </Cartao>

        <Cartao
          titulo="Usuários"
          descricao="O usuário ativo assina todas as operações na auditoria. Login e permissões entram no Bloco 3."
        >
          <ul className="space-y-1.5">
            {usuarios.map((usuario) => (
              <li key={usuario.id} className="flex items-center gap-2 text-sm">
                <span className="font-medium">{usuario.nome}</span>
                <Etiqueta tom={PAPEL_USUARIO.tom(usuario.papel)}>
                  {PAPEL_USUARIO.rotulo(usuario.papel)}
                </Etiqueta>
                <span className="text-xs text-[var(--texto-3)]">
                  {usuario.email}
                </span>
              </li>
            ))}
          </ul>
        </Cartao>

        <Cartao titulo="Base de dados">
          <p className="text-sm text-[var(--texto-2)]">
            {numero(categorias.reduce((s, c) => s + c._count.materiais, 0))} materiais
            cadastrados. Os dados atuais são de demonstração — antes de entrar em
            produção, rode <code className="font-mono text-xs">npm run db:reset</code>{" "}
            para limpar a base e comece pela carga inicial de inventário.
          </p>
        </Cartao>
      </div>
    </>
  );
}
